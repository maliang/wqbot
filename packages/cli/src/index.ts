import React from 'react'
import { render } from 'ink'
import { Command } from 'commander'
import chalk from 'chalk'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { initializeConfig, isApiConfigured } from '@wqbot/core'
import { App } from './ui/App.js'
import { SetupWizard } from './ui/SetupWizard.js'
import { initializeApiClient } from './api.js'

const VERSION = '0.1.0'
const DEFAULT_SERVER_PORT = 3721

interface CliOptions {
  model?: string
  conversation?: string
  serve?: boolean
  port?: string
  host?: string
  noHistory?: boolean
  standalone?: boolean
  setup?: boolean
}

// 查找 backend 入口文件路径
function resolveBackendPath(): string {
  const resolved = import.meta.resolve('@wqbot/backend')
  return fileURLToPath(resolved)
}

// 检测 bun 是否可用（backend 依赖 bun:sqlite，必须在 Bun 下运行）
function findBunExecutable(): string | null {
  try {
    execSync('bun --version', { stdio: 'ignore' })
    return 'bun'
  } catch {
    return null
  }
}

// 启动后端进程
function spawnBackend(host: string, port: number): ChildProcess {
  const backendPath = resolveBackendPath()
  const bunPath = findBunExecutable()

  if (!bunPath) {
    console.error(chalk.red('错误: 未找到 Bun 运行时'))
    console.error(chalk.yellow('后端依赖 bun:sqlite，必须在 Bun 下运行'))
    console.error(chalk.yellow('请安装 Bun: https://bun.sh/'))
    process.exit(1)
  }

  const child = spawn(bunPath, [backendPath, '--port', String(port), '--host', host], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  child.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(data)
  })

  return child
}

// 等待后端就绪（轮询 /api/health）
async function waitForBackend(baseUrl: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      // 后端尚未就绪
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`后端服务启动超时 (${timeoutMs}ms)`)
}

// 运行首次配置向导
async function runSetupWizard(): Promise<boolean> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      React.createElement(SetupWizard, {
        onComplete: () => resolve(true),
      })
    )
    waitUntilExit().then(() => resolve(false))
  })
}

async function main(): Promise<void> {
  const program = new Command()

  program.name('wqbot').description('WQBot - 智能 AI 管家').version(VERSION)

  program
    .argument('[message...]', '发送给 AI 的消息')
    .option('-m, --model <model>', '指定使用的模型')
    .option('-c, --conversation <id>', '继续指定的对话')
    .option('--serve', '启动后端服务（供 GUI 使用）')
    .option('--standalone', '独立模式，连接远程后端')
    .option('--port <port>', '服务端口', String(DEFAULT_SERVER_PORT))
    .option('--host <host>', '服务地址', '0.0.0.0')
    .option('--no-history', '不加载历史记录')
    .option('--setup', '重新运行配置向导')
    .action(async (messageParts: string[], options: CliOptions) => {
      // 初始化配置（用于检查 API 是否已配置）
      await initializeConfig()

      const needsSetup = options.setup || !(await isApiConfigured())

      if (needsSetup) {
        console.log(chalk.cyan('正在启动配置向导...\n'))
        const completed = await runSetupWizard()
        if (!completed) {
          console.log(chalk.yellow('配置已取消'))
          process.exit(0)
        }
        console.log(chalk.green('\n配置完成！\n'))
      }

      const port = parseInt(options.port || String(DEFAULT_SERVER_PORT), 10)
      const host = options.host || '0.0.0.0'
      const baseUrl = `http://${host}:${port}`
      const message = messageParts.join(' ')

      // serve 模式：仅启动后端，不渲染 UI
      if (options.serve) {
        const backendProcess = spawnBackend(host, port)
        backendProcess.stdout?.pipe(process.stdout)

        backendProcess.on('exit', (code) => {
          process.exit(code ?? 1)
        })

        process.on('SIGINT', () => backendProcess.kill('SIGINT'))
        process.on('SIGTERM', () => backendProcess.kill('SIGTERM'))
        return
      }

      // standalone 模式：连接远程后端，不 spawn
      if (options.standalone) {
        initializeApiClient(baseUrl)

        try {
          await waitForBackend(baseUrl, 5000)
        } catch {
          console.error(chalk.red(`无法连接到后端服务: ${baseUrl}`))
          process.exit(1)
        }

        const { waitUntilExit } = render(
          React.createElement(App, {
            initialMessage: message || undefined,
            model: options.model,
            conversationId: options.conversation,
            singleMode: !!message,
          })
        )

        await waitUntilExit()
        return
      }

      // 默认模式：spawn backend → 等待就绪 → 渲染 UI
      const backendProcess = spawnBackend(host, port)

      try {
        await waitForBackend(baseUrl)
      } catch (error) {
        backendProcess.kill()
        console.error(
          chalk.red('后端服务启动失败:'),
          error instanceof Error ? error.message : error
        )
        process.exit(1)
      }

      initializeApiClient(baseUrl)

      const cleanup = (): void => {
        try {
          backendProcess.kill()
        } catch {
          /* 已退出 */
        }
      }

      process.on('exit', cleanup)
      process.on('SIGINT', cleanup)
      process.on('SIGTERM', cleanup)

      const { waitUntilExit } = render(
        React.createElement(App, {
          initialMessage: message || undefined,
          model: options.model,
          conversationId: options.conversation,
          singleMode: !!message,
        })
      )

      await waitUntilExit()
      cleanup()
      process.exit(0)
    })

  // serve 子命令
  program
    .command('serve')
    .description('启动后端服务（供 GUI 使用）')
    .option('-p, --port <port>', '服务端口', String(DEFAULT_SERVER_PORT))
    .option('-H, --host <host>', '服务地址', '127.0.0.1')
    .action(async (options: { port?: string; host?: string }) => {
      const port = parseInt(options.port || String(DEFAULT_SERVER_PORT), 10)
      const host = options.host || '0.0.0.0'

      const backendProcess = spawnBackend(host, port)
      backendProcess.stdout?.pipe(process.stdout)

      backendProcess.on('exit', (code) => {
        process.exit(code ?? 1)
      })

      process.on('SIGINT', () => backendProcess.kill('SIGINT'))
      process.on('SIGTERM', () => backendProcess.kill('SIGTERM'))
    })

  await program.parseAsync(process.argv)
}

main().catch((error) => {
  console.error(chalk.red('致命错误:'), error)
  process.exit(1)
})
