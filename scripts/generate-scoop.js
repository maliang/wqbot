#!/usr/bin/env node

/**
 * 生成 Scoop manifest
 *
 * 用法: node scripts/generate-scoop.js <version> <sha256_win_x64>
 * 输出: dist/scoop/wqbot.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const [version, sha256WinX64] = process.argv.slice(2)

if (!version) {
  console.error('用法: node scripts/generate-scoop.js <version> [sha256_win_x64]')
  process.exit(1)
}

const templatePath = join(root, 'dist', 'scoop', 'wqbot.json.template')
const outputPath = join(root, 'dist', 'scoop', 'wqbot.json')

let template = readFileSync(templatePath, 'utf-8')

template = template
  .replace(/\{\{VERSION\}\}/g, version)
  .replace(/\{\{SHA256_WIN_X64\}\}/g, sha256WinX64 || 'TODO')

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, template, 'utf-8')

console.log(`Scoop manifest 已生成: ${outputPath}`)
