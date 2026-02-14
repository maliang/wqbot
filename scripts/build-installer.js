#!/usr/bin/env node

/**
 * WQBot 安装包构建脚本
 *
 * 构建流程：build sidecar → tauri build → NSIS PATH 补丁 → 收集安装包
 *
 * - Windows: NSIS 安装程序 (.exe)，自动管理 PATH 环境变量
 * - macOS: DMG 镜像 (.dmg)
 * - Linux: AppImage / deb
 */

import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'

// 加载 .env 文件到 process.env
async function loadEnv(projectRoot) {
  const envPath = path.join(projectRoot, '.env')
  try {
    const content = await fs.readFile(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex === -1) continue
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim()
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // .env 不存在则跳过
  }
}

const isWindows = os.platform() === 'win32'
const isMac = os.platform() === 'darwin'
const isLinux = os.platform() === 'linux'

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
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

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit', ...options })
  } catch (error) {
    throw new Error(`命令执行失败: ${cmd}`)
  }
}

function commandExists(cmd) {
  try {
    execSync(`where ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
}

function getProjectRoot() {
  return path.resolve(process.cwd())
}

/**
 * 补丁 NSIS 脚本，注入 PATH 环境变量管理代码，然后重编译安装包
 */
async function patchNsisForPath(projectRoot) {
  const nsisDir = path.join(
    projectRoot, 'packages', 'gui-tauri', 'src-tauri',
    'target', 'release', 'nsis', 'x64'
  )
  const nsisScript = path.join(nsisDir, 'installer.nsi')

  // 1. 读取 NSIS 脚本（UTF-16LE with BOM → UTF-8）
  let content
  try {
    const buf = await fs.readFile(nsisScript)
    // 跳过 BOM (FF FE) 并解码 UTF-16LE
    const hasUtf16Bom = buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE
    if (hasUtf16Bom) {
      content = buf.slice(2).toString('utf16le')
    } else {
      content = buf.toString('utf-8')
    }
  } catch (error) {
    logError(`无法读取 NSIS 脚本: ${nsisScript}`)
    throw error
  }

  const lines = content.split('\n')

  // 2. 定位 Install 注入点：包含 "EstimatedSize" 的行之后
  let installIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"EstimatedSize"')) {
      installIdx = i + 1
      break
    }
  }

  if (installIdx === -1) {
    logError('未找到 Install 注入点 (EstimatedSize)')
    throw new Error('NSIS 补丁失败：未找到 EstimatedSize 行')
  }

  // 3. 定位 Uninstall 注入点：包含 DeleteRegKey 和 UNINSTKEY 的行之前
  let uninstallIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('DeleteRegKey') && lines[i].includes('${UNINSTKEY}')) {
      uninstallIdx = i
      break
    }
  }

  if (uninstallIdx === -1) {
    logError('未找到 Uninstall 注入点 (DeleteRegKey UNINSTKEY)')
    throw new Error('NSIS 补丁失败：未找到 DeleteRegKey UNINSTKEY 行')
  }

  // 4. 注入 Install PATH 代码
  const installPatch = [
    '',
    '  ; === WQBot PATH 管理 - 安装 ===',
    '  ReadRegStr $R0 HKCU "Environment" "Path"',
    '  ${StrLoc} $R1 $R0 "$INSTDIR" ">"',
    '  ${If} $R1 == ""',
    '    ${If} $R0 == ""',
    '      WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"',
    '    ${Else}',
    '      WriteRegExpandStr HKCU "Environment" "Path" "$R0;$INSTDIR"',
    '    ${EndIf}',
    '    SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000',
    '  ${EndIf}',
    '',
  ].join('\n')

  // 5. 注入 Uninstall PATH 代码
  const uninstallPatch = [
    '',
    '  ; === WQBot PATH 管理 - 卸载 ===',
    "  nsExec::ExecToLog 'powershell -NoProfile -NonInteractive -Command \"[Environment]::SetEnvironmentVariable(''Path'', (([Environment]::GetEnvironmentVariable(''Path'', ''User'') -split '';'' | Where-Object { $$_ -ne ''$INSTDIR'' }) -join '';''), ''User'')\"'",
    '  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000',
    '',
  ].join('\n')

  // 先注入 Uninstall（索引较大），再注入 Install，避免索引偏移
  lines.splice(uninstallIdx, 0, uninstallPatch)
  lines.splice(installIdx, 0, installPatch)

  const patched = lines.join('\n')

  // 6. 写回文件（UTF-8，makensis 使用 /INPUTCHARSET UTF8）
  await fs.writeFile(nsisScript, patched, 'utf-8')
  logSuccess('NSIS PATH 补丁已注入')

  // 7. 查找 makensis.exe
  const makensisPath = await findMakensis()
  if (!makensisPath) {
    logError('未找到 makensis.exe，无法重编译 NSIS 脚本')
    throw new Error('makensis.exe 未找到')
  }
  logSuccess(`makensis: ${makensisPath}`)

  // 8. 重编译 NSIS 脚本
  log('  重编译 NSIS 安装包...', 'cyan')
  exec(`"${makensisPath}" /INPUTCHARSET UTF8 installer.nsi`, { cwd: nsisDir })
  logSuccess('NSIS 安装包重编译完成')

  // 9. 将新生成的安装包复制到 bundle/nsis/
  const nsisOutputExe = path.join(nsisDir, 'nsis-output.exe')
  const bundleNsisDir = path.join(
    projectRoot, 'packages', 'gui-tauri', 'src-tauri',
    'target', 'release', 'bundle', 'nsis'
  )

  try {
    const bundleFiles = await fs.readdir(bundleNsisDir)
    const targetExe = bundleFiles.find((f) => f.endsWith('.exe'))
    if (targetExe) {
      await fs.copyFile(nsisOutputExe, path.join(bundleNsisDir, targetExe))
      logSuccess(`已覆盖安装包: ${targetExe}`)
    } else {
      logError('bundle/nsis/ 中未找到 .exe 文件')
    }
  } catch (error) {
    logError(`复制安装包失败: ${error.message}`)
    throw error
  }

  logSuccess('NSIS PATH 补丁已应用')
}

/**
 * 查找 Tauri 缓存的 makensis.exe 或系统 PATH 中的 makensis
 */
async function findMakensis() {
  // 优先查找 Tauri 缓存目录
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    const candidates = [
      path.join(localAppData, 'tauri', 'NSIS', 'makensis.exe'),
      path.join(localAppData, 'tauri', 'makensis.exe'),
    ]
    for (const candidate of candidates) {
      try {
        await fs.access(candidate)
        return candidate
      } catch {
        // 继续尝试下一个
      }
    }

    // 递归搜索 tauri 目录下的 makensis.exe
    try {
      const tauriDir = path.join(localAppData, 'tauri')
      const found = await findFileRecursive(tauriDir, 'makensis.exe', 3)
      if (found) return found
    } catch {
      // 忽略
    }
  }

  // 最后尝试系统 PATH
  if (commandExists('makensis')) {
    return 'makensis'
  }

  return null
}

/**
 * 在目录中递归查找文件（限制深度）
 */
async function findFileRecursive(dir, filename, maxDepth) {
  if (maxDepth <= 0) return null
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
        return fullPath
      }
      if (entry.isDirectory()) {
        const found = await findFileRecursive(fullPath, filename, maxDepth - 1)
        if (found) return found
      }
    }
  } catch {
    // 权限不足等错误，忽略
  }
  return null
}

async function main() {
  const args = process.argv.slice(2)
  const targetPlatform = args[0] || 'current'

  console.log('')
  log('╔═══════════════════════════════════════════════════════════╗', 'cyan')
  log('║           WQBot 安装包构建工具                            ║', 'cyan')
  log('╚═══════════════════════════════════════════════════════════╝', 'cyan')
  console.log('')

  const projectRoot = getProjectRoot()

  await loadEnv(projectRoot)

  // 步骤 1: 检查环境
  logStep('1/6', '检查构建环境...')

  if (!commandExists('bun')) {
    logError('Bun 未安装，请访问 https://bun.sh/ 安装')
    process.exit(1)
  }
  logSuccess('Bun 已安装')

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

  // 检查 Tauri CLI
  try {
    execSync('pnpm tauri --version', {
      stdio: 'ignore',
      cwd: path.join(projectRoot, 'packages', 'gui-tauri'),
    })
    logSuccess('Tauri CLI 已安装')
  } catch {
    logError('Tauri CLI 未安装，请运行: pnpm add -D @tauri-apps/cli')
    process.exit(1)
  }

  // 检查 Tauri 签名密钥
  if (!process.env.TAURI_PRIVATE_KEY) {
    logError('Tauri 签名密钥未配置')
    log('  请在 .env 文件中设置 TAURI_PRIVATE_KEY，或参考 .env.example', 'yellow')
    process.exit(1)
  }
  logSuccess('Tauri 签名密钥已加载')

  // 步骤 2: 安装依赖
  logStep('2/6', '安装项目依赖...')
  exec('pnpm install')
  logSuccess('依赖安装完成')

  // 步骤 3: 构建 sidecar 二进制
  logStep('3/6', '编译 sidecar 二进制 (Bun compile)...')
  exec('node scripts/build-sidecar.js')
  logSuccess('Sidecar 二进制编译完成')

  // 步骤 4: 构建 Tauri 应用
  logStep('4/6', '构建 Tauri 桌面应用...')

  // 先构建前端
  exec('pnpm build')

  process.chdir(path.join(projectRoot, 'packages', 'gui-tauri'))

  let tauriBuildCmd = 'pnpm tauri build'
  if (targetPlatform !== 'current') {
    log(`目标平台: ${targetPlatform}`, 'yellow')
  }

  exec(tauriBuildCmd)
  logSuccess('Tauri 应用构建完成')

  // 步骤 5: 补丁 NSIS 脚本（仅 Windows）
  if (isWindows) {
    logStep('5/6', '补丁 NSIS 脚本 (PATH 管理)...')
    await patchNsisForPath(projectRoot)
  } else {
    logStep('5/6', '跳过 NSIS 补丁（非 Windows 平台）')
  }

  // 步骤 6: 收集安装包
  logStep('6/6', '收集安装包...')

  process.chdir(projectRoot)

  const bundlePath = path.join(
    projectRoot,
    'packages',
    'gui-tauri',
    'src-tauri',
    'target',
    'release',
    'bundle'
  )
  const outputPath = path.join(projectRoot, 'dist', 'installers')

  await fs.mkdir(outputPath, { recursive: true })

  const installers = []

  if (isWindows) {
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
  }

  if (isLinux) {
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
