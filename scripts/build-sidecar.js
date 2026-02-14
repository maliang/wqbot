#!/usr/bin/env node

/**
 * Bun compile 构建脚本
 *
 * 将 backend 和 CLI 编译为独立二进制，供 Tauri sidecar 和安装包使用。
 * Tauri sidecar 要求二进制命名为 `{name}-{target_triple}{ext}`。
 *
 * 注意：此脚本使用 `bun build --compile` 而非 tsup，因为需要生成
 * 自包含的单文件二进制（内嵌 Bun 运行时），tsup 只能输出 JS bundle。
 */

import { execSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PROJECT_ROOT = process.cwd()

function getTargetTriple() {
  const arch = os.arch()
  const platform = os.platform()

  const archMap = {
    x64: 'x86_64',
    arm64: 'aarch64',
  }

  const tripleArch = archMap[arch]
  if (!tripleArch) {
    throw new Error(`Unsupported architecture: ${arch}`)
  }

  switch (platform) {
    case 'win32':
      return `${tripleArch}-pc-windows-msvc`
    case 'darwin':
      return `${tripleArch}-apple-darwin`
    case 'linux':
      return `${tripleArch}-unknown-linux-gnu`
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

function getBunTarget() {
  const arch = os.arch()
  const platform = os.platform()

  const platformMap = {
    win32: 'windows',
    darwin: 'darwin',
    linux: 'linux',
  }

  const bunPlatform = platformMap[platform]
  if (!bunPlatform) {
    throw new Error(`Unsupported platform: ${platform}`)
  }

  return `bun-${bunPlatform}-${arch}`
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function buildBinary({ name, entry, outDir, targetTriple }) {
  const ext = os.platform() === 'win32' ? '.exe' : ''
  const outPath = path.join(outDir, `${name}-${targetTriple}${ext}`)
  const bunTarget = getBunTarget()

  console.log(`\n[build-sidecar] 编译 ${name}...`)
  console.log(`  入口: ${entry}`)
  console.log(`  输出: ${outPath}`)
  console.log(`  目标: ${bunTarget}`)

  // 不可用的可选依赖，标记为 external 避免构建失败
  const externals = ['react-devtools-core']
  const externalFlags = externals.map(pkg => `--external "${pkg}"`).join(' ')

  const cmd = `bun build --compile --target=${bunTarget} ${externalFlags} "${entry}" --outfile "${outPath}"`
  execSync(cmd, { stdio: 'inherit', cwd: PROJECT_ROOT })

  // 验证输出文件存在
  try {
    const stat = await fs.stat(outPath)
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2)
    console.log(`  大小: ${sizeMB} MB`)
  } catch {
    throw new Error(`编译输出文件不存在: ${outPath}`)
  }

  return outPath
}

async function main() {
  const args = process.argv.slice(2)
  const buildBackend = args.length === 0 || args.includes('backend') || args.includes('all')
  const buildCli = args.length === 0 || args.includes('cli') || args.includes('all')

  const targetTriple = getTargetTriple()
  console.log(`[build-sidecar] 目标平台: ${targetTriple}`)

  const sidecarDir = path.join(PROJECT_ROOT, 'packages', 'gui-tauri', 'src-tauri', 'binaries')
  await ensureDir(sidecarDir)

  if (buildBackend) {
    await buildBinary({
      name: 'wqbot-backend',
      entry: path.join(PROJECT_ROOT, 'packages', 'backend', 'src', 'index.ts'),
      outDir: sidecarDir,
      targetTriple,
    })
  }

  if (buildCli) {
    await buildBinary({
      name: 'wqbot-cli',
      entry: path.join(PROJECT_ROOT, 'packages', 'cli', 'src', 'index.ts'),
      outDir: sidecarDir,
      targetTriple,
    })

    // 同时输出到 dist/ 供安装包使用
    const distDir = path.join(PROJECT_ROOT, 'dist')
    await ensureDir(distDir)
    const ext = os.platform() === 'win32' ? '.exe' : ''
    const sidecarPath = path.join(sidecarDir, `wqbot-cli-${targetTriple}${ext}`)
    const distPath = path.join(distDir, `wqbot${ext}`)
    await fs.copyFile(sidecarPath, distPath)
    console.log(`\n[build-sidecar] CLI 已复制到: ${distPath}`)
  }

  console.log('\n[build-sidecar] 构建完成!')
}

main().catch((err) => {
  console.error('[build-sidecar] 构建失败:', err.message)
  process.exit(1)
})
