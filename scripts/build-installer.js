#!/usr/bin/env node

/**
 * WQBot 安装包构建脚本
 *
 * 构建跨平台安装包：
 * - Windows: NSIS 安装程序 (.exe)
 * - macOS: DMG 镜像 (.dmg)
 * - Linux: AppImage / deb
 */

import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'

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

// 执行命令
function exec(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit', ...options })
  } catch (error) {
    throw new Error(`命令执行失败: ${cmd}`)
  }
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

// 获取项目根目录
function getProjectRoot() {
  return path.resolve(process.cwd())
}

// 主构建流程
async function main() {
  const args = process.argv.slice(2)
  const targetPlatform = args[0] || 'current'

  console.log('')
  log('╔═══════════════════════════════════════════════════════════╗', 'cyan')
  log('║           WQBot 安装包构建工具                            ║', 'cyan')
  log('╚═══════════════════════════════════════════════════════════╝', 'cyan')
  console.log('')

  const projectRoot = getProjectRoot()

  // 步骤 1: 检查环境
  logStep('1/5', '检查构建环境...')

  if (!commandExists('node')) {
    logError('Node.js 未安装')
    process.exit(1)
  }
  logSuccess('Node.js 已安装')

  if (!commandExists('pnpm')) {
    logError('pnpm 未安装，请运行: npm install -g pnpm')
    process.exit(1)
  }
  logSuccess('pnpm 已安装')

  if (!commandExists('cargo')) {
    logError('Rust 未安装，请访问 https://rustup.rs/ 安装')
    process.exit(1)
  }
  logSuccess('Rust 已安装')

  if (!commandExists('git')) {
    logError('Git 未安装，请访问 https://git-scm.com/ 安装')
    process.exit(1)
  }
  logSuccess('Git 已安装')

  // 检查 Tauri CLI
  try {
    execSync('pnpm tauri --version', { stdio: 'ignore', cwd: path.join(projectRoot, 'packages', 'gui-tauri') })
    logSuccess('Tauri CLI 已安装')
  } catch {
    logError('Tauri CLI 未安装，请运行: pnpm add -D @tauri-apps/cli')
    process.exit(1)
  }

  // 步骤 2: 安装依赖
  logStep('2/5', '安装项目依赖...')
  exec('pnpm install')
  logSuccess('依赖安装完成')

  // 步骤 3: 构建所有包
  logStep('3/5', '构建项目...')
  exec('pnpm build')
  logSuccess('项目构建完成')

  // 步骤 4: 构建 Tauri 应用
  logStep('4/5', '构建 Tauri 桌面应用...')

  process.chdir(path.join(projectRoot, 'packages', 'gui-tauri'))

  // 根据目标平台构建
  let tauriBuildCmd = 'pnpm tauri build'

  if (targetPlatform !== 'current') {
    // 交叉编译（需要额外配置）
    log(`目标平台: ${targetPlatform}`, 'yellow')
  }

  exec(tauriBuildCmd)
  logSuccess('Tauri 应用构建完成')

  // Windows 平台：运行 patch-nsis.js 注入 CLI
  if (isWindows) {
    logStep('4.5/5', '注入 CLI 到 NSIS 安装包...')
    process.chdir(projectRoot)
    exec('node scripts/patch-nsis.js')
    logSuccess('NSIS 安装包已注入 CLI')
    process.chdir(path.join(projectRoot, 'packages', 'gui-tauri'))
  }

  // 步骤 5: 收集安装包
  logStep('5/5', '收集安装包...')

  const bundlePath = path.join(projectRoot, 'packages', 'gui-tauri', 'src-tauri', 'target', 'release', 'bundle')
  const outputPath = path.join(projectRoot, 'dist', 'installers')

  // 创建输出目录
  await fs.mkdir(outputPath, { recursive: true })

  // 复制安装包到统一目录
  const installers = []

  if (isWindows) {
    // Windows: NSIS 安装程序
    const nsisPath = path.join(bundlePath, 'nsis')
    try {
      const files = await fs.readdir(nsisPath)
      for (const file of files) {
        if (file.endsWith('.exe')) {
          const src = path.join(nsisPath, file)
          const dest = path.join(outputPath, file)
          await fs.copyFile(src, dest)
          installers.push(dest)
        }
      }
    } catch {
      log('NSIS 安装包未找到', 'yellow')
    }

    // Windows: MSI 安装程序
    const msiPath = path.join(bundlePath, 'msi')
    try {
      const files = await fs.readdir(msiPath)
      for (const file of files) {
        if (file.endsWith('.msi')) {
          const src = path.join(msiPath, file)
          const dest = path.join(outputPath, file)
          await fs.copyFile(src, dest)
          installers.push(dest)
        }
      }
    } catch {
      log('MSI 安装包未找到', 'yellow')
    }
  }

  if (isMac) {
    // macOS: DMG
    const dmgPath = path.join(bundlePath, 'dmg')
    try {
      const files = await fs.readdir(dmgPath)
      for (const file of files) {
        if (file.endsWith('.dmg')) {
          const src = path.join(dmgPath, file)
          const dest = path.join(outputPath, file)
          await fs.copyFile(src, dest)
          installers.push(dest)
        }
      }
    } catch {
      log('DMG 安装包未找到', 'yellow')
    }

    // macOS: App Bundle
    const macosPath = path.join(bundlePath, 'macos')
    try {
      const files = await fs.readdir(macosPath)
      for (const file of files) {
        if (file.endsWith('.app')) {
          // 压缩 .app 为 .zip
          const appPath = path.join(macosPath, file)
          const zipName = file.replace('.app', '.app.zip')
          const zipPath = path.join(outputPath, zipName)
          exec(`zip -r "${zipPath}" "${appPath}"`, { cwd: macosPath })
          installers.push(zipPath)
        }
      }
    } catch {
      log('App Bundle 未找到', 'yellow')
    }
  }

  if (isLinux) {
    // Linux: AppImage
    const appImagePath = path.join(bundlePath, 'appimage')
    try {
      const files = await fs.readdir(appImagePath)
      for (const file of files) {
        if (file.endsWith('.AppImage')) {
          const src = path.join(appImagePath, file)
          const dest = path.join(outputPath, file)
          await fs.copyFile(src, dest)
          installers.push(dest)
        }
      }
    } catch {
      log('AppImage 未找到', 'yellow')
    }

    // Linux: deb
    const debPath = path.join(bundlePath, 'deb')
    try {
      const files = await fs.readdir(debPath)
      for (const file of files) {
        if (file.endsWith('.deb')) {
          const src = path.join(debPath, file)
          const dest = path.join(outputPath, file)
          await fs.copyFile(src, dest)
          installers.push(dest)
        }
      }
    } catch {
      log('deb 包未找到', 'yellow')
    }
  }

  // 完成
  console.log('')
  log('╔═══════════════════════════════════════════════════════════╗', 'green')
  log('║           构建完成!                                       ║', 'green')
  log('╚═══════════════════════════════════════════════════════════╝', 'green')
  console.log('')

  if (installers.length > 0) {
    log('生成的安装包:', 'bright')
    console.log('')

    // 计算 SHA256 校验和
    const checksumLines = []
    for (const installer of installers) {
      const fileBuffer = await fs.readFile(installer)
      const hash = createHash('sha256').update(fileBuffer).digest('hex')
      const stat = await fs.stat(installer)
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(2)
      const fileName = path.basename(installer)

      console.log(`  ${fileName}  (${sizeMB} MB)`)
      console.log(`    SHA256: ${hash}`)
      checksumLines.push(`${hash}  ${fileName}`)
    }

    // 写入 checksums.txt
    const checksumsPath = path.join(outputPath, 'checksums.txt')
    await fs.writeFile(checksumsPath, checksumLines.join('\n') + '\n', 'utf-8')

    console.log('')
    log(`安装包目录: ${outputPath}`, 'cyan')
    log(`校验和文件: ${checksumsPath}`, 'cyan')
  } else {
    log('未找到安装包，请检查构建日志', 'yellow')
  }

  console.log('')
}

main().catch((error) => {
  logError(`构建失败: ${error.message}`)
  process.exit(1)
})
