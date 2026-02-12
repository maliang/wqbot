#!/usr/bin/env node

import React from 'react'
import { render } from 'ink'
import { Command } from 'commander'
import chalk from 'chalk'
import { initializeConfig, initializeLogger, setLocale, isApiConfigured } from '@wqbot/core'
import type { Locale } from '@wqbot/core'
import { initializeDatabase, getSettingsStore, getConversationStore } from '@wqbot/storage'
import { initializeSkillRegistry } from '@wqbot/skills'
import { initializeModelRouter, getModelRouter } from '@wqbot/models'
import { initializeSandbox, initializePermissionManager, initializeAuditLog } from '@wqbot/security'
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

// 全局状态，供内嵌模式使用
let isInitialized = false

async function initializeSystems(): Promise<void> {
  if (isInitialized) return

  await initializeConfig()
  initializeLogger()
  await initializeDatabase()

  // 加载语言设置
  const settings = getSettingsStore()
  const savedLanguage = settings.get('language')
  if (savedLanguage) {
    try {
      setLocale(savedLanguage as Locale)
    } catch {
      // 忽略无效的语言设置
    }
  }

  await initializeSkillRegistry()
  await initializeModelRouter()
  initializeSandbox()
  initializePermissionManager()
  initializeAuditLog()

  isInitialized = true
}

// 运行首次配置向导
async function runSetupWizard(): Promise<boolean> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(
      React.createElement(SetupWizard, {
        onComplete: () => resolve(true)
      })
    )

    waitUntilExit().then(() => resolve(false))
  })
}

async function startServer(host: string, port: number): Promise<void> {
  const { startServer: start } = await import('@wqbot/backend')
  await start({ host, port })
}

// 内嵌模式：直接使用本地模块，无需后端服务
async function runEmbeddedMode(options: {
  initialMessage?: string
  model?: string
  conversationId?: string
  singleMode?: boolean
}): Promise<void> {
  const conversationStore = getConversationStore()
  const modelRouter = getModelRouter()

  // 创建内嵌 API 适配器
  const embeddedApi = {
    async sendMessageStream(
      message: string,
      conversationId?: string,
      model?: string,
      onChunk?: (chunk: string) => void,
      onComplete?: (response: { conversationId: string; response: string }) => void,
      onError?: (error: string) => void
    ): Promise<{ abort: () => void }> {
      let convId = conversationId

      // 创建或获取对话
      if (!convId) {
        const conv = conversationStore.createConversation()
        convId = conv.id
      }

      // 添加用户消息
      conversationStore.addMessage(convId, {
        role: 'user',
        content: message
      })

      // 获取对话历史
      const conversation = conversationStore.getConversation(convId)
      if (!conversation) {
        onError?.('对话不存在')
        return { abort: () => {} }
      }

      const messages = conversation.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

      let fullResponse = ''
      let aborted = false

      try {
        const stream = await modelRouter.chat(messages, {
          stream: true,
          model
        })

        for await (const chunk of stream) {
          if (aborted) break
          fullResponse += chunk
          onChunk?.(chunk)
        }

        if (!aborted) {
          // 保存助手响应
          conversationStore.addMessage(convId, {
            role: 'assistant',
            content: fullResponse
          })

          onComplete?.({
            conversationId: convId,
            response: fullResponse
          })
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : '未知错误')
      }

      return {
        abort: () => {
          aborted = true
        }
      }
    },

    async listConversations(limit?: number) {
      return {
        success: true,
        data: conversationStore.listConversations(limit)
      }
    },

    async getConversation(id: string) {
      return {
        success: true,
        data: conversationStore.getConversation(id)
      }
    },

    async createConversation(title?: string) {
      return {
        success: true,
        data: conversationStore.createConversation(title)
      }
    },

    async deleteConversation(id: string) {
      conversationStore.deleteConversation(id)
      return { success: true }
    },

    async listConfigs() {
      // TODO: 从 ConfigWatcher 获取
      return { success: true, data: [] }
    },

    async listTasks() {
      return { success: true, data: [] }
    },

    async getSettings() {
      return { success: true, data: getSettingsStore().getAll() }
    },

    async getSetting(key: string) {
      return {
        success: true,
        data: { key, value: getSettingsStore().get(key as never) }
      }
    },

    async setSetting(key: string, value: unknown) {
      getSettingsStore().set(key as never, value as never)
      return { success: true }
    }
  }

  // 设置全局 API
  ;(globalThis as Record<string, unknown>).__wqbot_embedded_api__ = embeddedApi

  const { waitUntilExit } = render(
    React.createElement(App, {
      initialMessage: options.initialMessage,
      model: options.model,
      conversationId: options.conversationId,
      singleMode: options.singleMode,
      embeddedMode: true
    })
  )

  await waitUntilExit()
}

async function main(): Promise<void> {
  const program = new Command()

  program
    .name('wqbot')
    .description('WQBot - 智能 AI 管家')
    .version(VERSION)

  program
    .argument('[message...]', '发送给 AI 的消息')
    .option('-m, --model <model>', '指定使用的模型')
    .option('-c, --conversation <id>', '继续指定的对话')
    .option('--serve', '启动后端服务（供 GUI 使用）')
    .option('--standalone', '独立模式，连接远程后端')
    .option('--port <port>', '服务端口', String(DEFAULT_SERVER_PORT))
    .option('--host <host>', '服务地址', '127.0.0.1')
    .option('--no-history', '不加载历史记录')
    .option('--setup', '重新运行配置向导')
    .action(async (messageParts: string[], options: CliOptions) => {
      // 检查是否需要运行配置向导
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

      // 初始化核心系统
      try {
        await initializeSystems()
      } catch (error) {
        console.error(chalk.red('初始化失败:'), error)
        process.exit(1)
      }

      // serve 模式：启动后端服务
      if (options.serve) {
        const port = parseInt(options.port || String(DEFAULT_SERVER_PORT), 10)
        const host = options.host || '127.0.0.1'

        try {
          await startServer(host, port)
        } catch (error) {
          console.error(chalk.red('启动服务器失败:'), error)
          process.exit(1)
        }
        return
      }

      const message = messageParts.join(' ')

      // standalone 模式：连接远程后端
      if (options.standalone) {
        const port = parseInt(options.port || String(DEFAULT_SERVER_PORT), 10)
        const host = options.host || '127.0.0.1'
        initializeApiClient(`http://${host}:${port}`)

        const { waitUntilExit } = render(
          React.createElement(App, {
            initialMessage: message || undefined,
            model: options.model,
            conversationId: options.conversation,
            singleMode: !!message,
            embeddedMode: false
          })
        )

        await waitUntilExit()
        return
      }

      // 默认：内嵌模式，直接运行
      await runEmbeddedMode({
        initialMessage: message || undefined,
        model: options.model,
        conversationId: options.conversation,
        singleMode: !!message
      })
    })

  // serve 子命令
  program
    .command('serve')
    .description('启动后端服务（供 GUI 使用）')
    .option('-p, --port <port>', '服务端口', String(DEFAULT_SERVER_PORT))
    .option('-H, --host <host>', '服务地址', '127.0.0.1')
    .action(async (options: { port?: string; host?: string }) => {
      try {
        await initializeSystems()
      } catch (error) {
        console.error(chalk.red('初始化失败:'), error)
        process.exit(1)
      }

      const port = parseInt(options.port || String(DEFAULT_SERVER_PORT), 10)
      const host = options.host || '127.0.0.1'

      try {
        await startServer(host, port)
      } catch (error) {
        console.error(chalk.red('启动服务器失败:'), error)
        process.exit(1)
      }
    })

  await program.parseAsync(process.argv)
}

main().catch((error) => {
  console.error(chalk.red('致命错误:'), error)
  process.exit(1)
})
