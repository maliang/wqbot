#!/usr/bin/env node

/**
 * NSIS 安装包后处理脚本
 *
 * 在 Tauri 构建完成后：
 * 1. 创建 wqbot.cmd 包装脚本
 * 2. 修改生成的 installer.nsi，注入 PATH 注册和 CLI 安装逻辑
 * 3. 重新运行 makensis 生成更新后的安装包
 */

import { promises as fs } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

const PROJECT_ROOT = process.cwd()

// 从 gui-tauri 的 package.json 动态读取版本号
const guiPkgPath = path.join(PROJECT_ROOT, 'packages', 'gui-tauri', 'package.json')
const guiPkg = JSON.parse(await fs.readFile(guiPkgPath, 'utf-8'))
const VERSION = guiPkg.version
const NSIS_DIR = path.join(os.homedir(), 'AppData', 'Local', 'tauri', 'NSIS')
const MAKENSIS = path.join(NSIS_DIR, 'makensis.exe')
const NSI_DIR = path.join(PROJECT_ROOT, 'packages', 'gui-tauri', 'src-tauri', 'target', 'release', 'nsis', 'x64')
const NSI_PATH = path.join(NSI_DIR, 'installer.nsi')
const NSIS_OUTPUT_DIR = path.join(PROJECT_ROOT, 'packages', 'gui-tauri', 'src-tauri', 'target', 'release', 'bundle', 'nsis')
const WQBOT_CMD_PATH = path.join(NSI_DIR, 'wqbot.cmd')
const CLI_JS_PATH = path.join(PROJECT_ROOT, 'packages', 'cli', 'dist', 'index.js').replace(/\\/g, '\\\\')

// 创建 wqbot.cmd 包装脚本
async function createWqbotCmd() {
  const content = '@echo off\r\nnode "%~dp0cli\\index.js" %*\r\n'
  await fs.writeFile(WQBOT_CMD_PATH, content, 'utf-8')
  console.log('[patch-nsis] wqbot.cmd 已创建')
}

// 读取 NSI 文件（处理 UTF-16LE BOM）
async function readNsi() {
  const buf = await fs.readFile(NSI_PATH)
  if (buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.toString('utf16le').slice(1)
  }
  return buf.toString('utf16le')
}

// 写入 NSI 文件（UTF-16LE + BOM）
async function writeNsi(content) {
  const bom = Buffer.from([0xFF, 0xFE])
  const body = Buffer.from(content, 'utf16le')
  await fs.writeFile(NSI_PATH, Buffer.concat([bom, body]))
  console.log('[patch-nsis] installer.nsi 已更新')
}

// 在指定标记后注入代码
function injectAfter(nsi, marker, code) {
  // 尝试 \r\n 和 \n 两种换行
  for (const lineEnd of ['\r\n', '\n']) {
    const target = marker + lineEnd
    if (nsi.includes(target)) {
      return nsi.replace(target, target + code + lineEnd)
    }
  }
  throw new Error(`找不到注入标记: ${marker}`)
}

function patchNsi(nsi) {
  const cmdPath = WQBOT_CMD_PATH.replace(/\\/g, '\\\\')

  // === 安装段落注入 ===
  const installCode = [
    '',
    '  ; === WQBot CLI ===',
    '  CreateDirectory "$INSTDIR\\cli"',
    `  File /a "/oname=wqbot.cmd" "${cmdPath}"`,
    `  File /a "/oname=cli\\index.js" "${CLI_JS_PATH}"`,
    '',
    '  ; 添加 $INSTDIR 到用户 PATH',
    '  ReadRegStr $0 HKCU "Environment" "Path"',
    '  ${StrLoc} $1 $0 $INSTDIR ">"',
    '  StrCmp $1 "" 0 wqbot_skip_path',
    '    StrCmp $0 "" 0 +3',
    '      WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"',
    '      Goto wqbot_skip_path',
    '    WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"',
    '  wqbot_skip_path:',
    '  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000',
    '  ; === WQBot CLI END ===',
    '',
  ].join('\r\n')

  nsi = injectAfter(nsi, '  ; Copy external binaries', installCode)

  // === 卸载段落注入 ===
  const uninstallCode = [
    '',
    '  ; === WQBot CLI 卸载 ===',
    '  Delete "$INSTDIR\\wqbot.cmd"',
    '  Delete "$INSTDIR\\cli\\index.js"',
    '  RMDir "$INSTDIR\\cli"',
    '',
    '  ; 从用户 PATH 移除 $INSTDIR',
    '  ReadRegStr $0 HKCU "Environment" "Path"',
    '  ${WordReplace} $0 ";$INSTDIR" "" "+" $0',
    '  ${WordReplace} $0 "$INSTDIR;" "" "+" $0',
    '  ${WordReplace} $0 "$INSTDIR" "" "+" $0',
    '  WriteRegExpandStr HKCU "Environment" "Path" $0',
    '  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000',
    '  ; === WQBot CLI 卸载结束 ===',
    '',
  ].join('\r\n')

  nsi = injectAfter(nsi, '  ; Delete external binaries', uninstallCode)

  return nsi
}

// 重新运行 makensis
function runMakensis() {
  console.log('[patch-nsis] 重新运行 makensis...')
  execSync(`"${MAKENSIS}" installer.nsi`, {
    cwd: NSI_DIR,
    stdio: 'inherit',
  })

  // 复制输出到 bundle 目录
  const src = path.join(NSI_DIR, 'nsis-output.exe')
  const dest = path.join(NSIS_OUTPUT_DIR, `WQBot_${VERSION}_x64-setup.exe`)
  execSync(`copy /Y "${src}" "${dest}"`, { stdio: 'inherit' })
  console.log(`[patch-nsis] 安装包已更新: ${dest}`)
}

async function main() {
  console.log('[patch-nsis] 开始后处理 NSIS 安装包...')

  await createWqbotCmd()

  let nsi = await readNsi()
  nsi = patchNsi(nsi)
  await writeNsi(nsi)

  runMakensis()

  console.log('[patch-nsis] 完成!')
}

main().catch((err) => {
  console.error('[patch-nsis] 失败:', err.message)
  process.exit(1)
})
