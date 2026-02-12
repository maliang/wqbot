#!/usr/bin/env node

/**
 * WQBot 安装脚本
 *
 * 用法:
 *   npx wqbot-install
 *   或
 *   node scripts/install.js
 */

import { execSync, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import readline from 'node:readline'

const isWindows = os.platform() === 'win32'
const isMac = os.platform() === 'darwin'
const isLinux = os.platform() === 'linux'

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logStep(step, message) {
  console.log(`${colors.cyan}[${step}]${colors.reset} ${message}`)
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`)
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`)
}

// 检查命令是否存在
function commandExists(cmd) {
  try {
    execSync(isWindows ? `where ${cmd}` : `which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// 执行命令
function exec(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...options })
  } catch (error) {
    throw new Error(`命令执行失败: ${cmd}\n${error.message}`)
  }
}

// 询问用户
async function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// 主安装流程
async function main() {
  console.log('')
  log('╔═══════════════════════════════════════════════════════════╗', 'cyan')
  log('║           WQBot 安装程序                                  ║', 'cyan')
  log('║           智能 AI 管家 - 跨平台安装                       ║', 'cyan')
  log('╚═══════════════════════════════════════════════════════════╝', 'cyan')
  console.log('')

  // 检查 Node.js 版本
  logStep('1/6', '检查 Node.js 版本...')
  const nodeVersion = process.version
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10)
  if (majorVersion < 20) {
    logError(`Node.js 版本过低: ${nodeVersion}，需要 v20.0.0 或更高`)
    process.exit(1)
  }
  logSuccess(`Node.js ${nodeVersion}`)

  // 检查 pnpm
  logStep('2/6', '检查 pnpm...')
  if (!commandExists('pnpm')) {
    log('pnpm 未安装，正在安装...', 'yellow')
    try {
      exec('npm install -g pnpm')
      logSuccess('pnpm 已安装')
    } catch (error) {
      logError('pnpm 安装失败，请手动安装: npm install -g pnpm')
      process.exit(1)
    }
  } else {
    logSuccess('pnpm 已安装')
  }

  // 安装依赖
  logStep('3/6', '安装项目依赖...')
  try {
    exec('pnpm install', { stdio: 'inherit' })
    logSuccess('依赖安装完成')
  } catch (error) {
    logError('依赖安装失败')
    process.exit(1)
  }

  // 构建项目
  logStep('4/6', '构建项目...')
  try {
    exec('pnpm build', { stdio: 'inherit' })
    logSuccess('项目构建完成')
  } catch (error) {
    logError('项目构建失败')
    process.exit(1)
  }

  // 全局安装 CLI
  logStep('5/6', '安装 CLI 命令...')
  try {
    process.chdir('packages/cli')
    exec('pnpm link --global')
    process.chdir('../..')
    logSuccess('CLI 已安装，可以使用 "wqbot" 命令')
  } catch (error) {
    logError('CLI 安装失败')
    console.log('  请手动执行: cd packages/cli && pnpm link --global')
  }

  // 询问是否构建 GUI
  logStep('6/6', '构建桌面应用...')
  const buildGui = await ask('是否构建 Tauri 桌面应用? (y/N): ')

  if (buildGui.toLowerCase() === 'y') {
    // 检查 Rust
    if (!commandExists('cargo')) {
      log('Rust 未安装，请先安装 Rust: https://rustup.rs/', 'yellow')
      log('安装后重新运行: pnpm build:gui', 'yellow')
    } else {
      try {
        exec('pnpm build:gui', { stdio: 'inherit' })
        logSuccess('桌面应用构建完成')

        // 显示安装包位置
        const guiPath = path.join(process.cwd(), 'packages', 'gui-tauri', 'src-tauri', 'target', 'release', 'bundle')
        log(`\n安装包位置: ${guiPath}`, 'cyan')
      } catch (error) {
        logError('桌面应用构建失败')
        console.log('  请确保已安装 Rust 和 Tauri 依赖')
      }
    }
  }

  // 完成
  console.log('')
  log('╔═══════════════════════════════════════════════════════════╗', 'green')
  log('║           安装完成!                                       ║', 'green')
  log('╚═══════════════════════════════════════════════════════════╝', 'green')
  console.log('')
  log('使用方法:', 'bright')
  console.log('')
  console.log('  CLI 对话模式:')
  console.log('    $ wqbot')
  console.log('')
  console.log('  单次提问:')
  console.log('    $ wqbot "你好"')
  console.log('')
  console.log('  重新配置:')
  console.log('    $ wqbot --setup')
  console.log('')
  console.log('  启动后端服务 (供 GUI 使用):')
  console.log('    $ wqbot serve')
  console.log('')
  log('首次运行会自动进入配置向导，设置 AI 模型 API。', 'cyan')
  console.log('')
}

main().catch((error) => {
  logError(`安装失败: ${error.message}`)
  process.exit(1)
})
