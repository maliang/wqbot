#!/usr/bin/env node

/**
 * 版本同步脚本
 *
 * 从 @wqbot/core 的 package.json 读取版本号，同步到：
 * - packages/gui-tauri/src-tauri/Cargo.toml
 * - packages/gui-tauri/src-tauri/tauri.conf.json
 * - 根 package.json
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

const PROJECT_ROOT = process.cwd()

async function main() {
  // 从 @wqbot/core 读取版本号
  const corePkgPath = path.join(PROJECT_ROOT, 'packages', 'core', 'package.json')
  const corePkg = JSON.parse(await fs.readFile(corePkgPath, 'utf-8'))
  const version = corePkg.version

  console.log(`[version-sync] 源版本号 (@wqbot/core): ${version}`)

  let synced = 0

  // 1. 同步根 package.json
  const rootPkgPath = path.join(PROJECT_ROOT, 'package.json')
  const rootPkg = JSON.parse(await fs.readFile(rootPkgPath, 'utf-8'))
  if (rootPkg.version !== version) {
    rootPkg.version = version
    await fs.writeFile(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf-8')
    console.log(`[version-sync] 根 package.json → ${version}`)
    synced++
  }

  // 2. 同步 Cargo.toml
  const cargoPath = path.join(PROJECT_ROOT, 'packages', 'gui-tauri', 'src-tauri', 'Cargo.toml')
  let cargo = await fs.readFile(cargoPath, 'utf-8')
  const cargoVersionRegex = /^(version\s*=\s*)"[^"]*"/m
  const cargoMatch = cargo.match(cargoVersionRegex)
  if (cargoMatch && cargoMatch[0] !== `version = "${version}"`) {
    cargo = cargo.replace(cargoVersionRegex, `$1"${version}"`)
    await fs.writeFile(cargoPath, cargo, 'utf-8')
    console.log(`[version-sync] Cargo.toml → ${version}`)
    synced++
  }

  // 3. 同步 tauri.conf.json
  const tauriConfPath = path.join(PROJECT_ROOT, 'packages', 'gui-tauri', 'src-tauri', 'tauri.conf.json')
  const tauriConf = JSON.parse(await fs.readFile(tauriConfPath, 'utf-8'))
  if (tauriConf.package.version !== version) {
    tauriConf.package.version = version
    await fs.writeFile(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf-8')
    console.log(`[version-sync] tauri.conf.json → ${version}`)
    synced++
  }

  if (synced === 0) {
    console.log('[version-sync] 所有版本号已同步，无需更新')
  } else {
    console.log(`[version-sync] 完成，已同步 ${synced} 个文件`)
  }
}

main().catch((err) => {
  console.error('[version-sync] 失败:', err.message)
  process.exit(1)
})
