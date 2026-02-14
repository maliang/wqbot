#!/usr/bin/env node

/**
 * 生成 Homebrew Formula
 *
 * 用法: node scripts/generate-homebrew.js <version> <sha256_mac_arm> <sha256_mac_x64> <sha256_linux>
 * 输出: dist/homebrew/wqbot.rb
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const [version, sha256MacArm, sha256MacX64, sha256Linux] = process.argv.slice(2)

if (!version) {
  console.error('用法: node scripts/generate-homebrew.js <version> [sha256_mac_arm] [sha256_mac_x64] [sha256_linux]')
  process.exit(1)
}

const templatePath = join(root, 'dist', 'homebrew', 'wqbot.rb.template')
const outputPath = join(root, 'dist', 'homebrew', 'wqbot.rb')

let template = readFileSync(templatePath, 'utf-8')

template = template
  .replace(/\{\{VERSION\}\}/g, version)
  .replace(/\{\{SHA256_MAC_ARM\}\}/g, sha256MacArm || 'TODO')
  .replace(/\{\{SHA256_MAC_X64\}\}/g, sha256MacX64 || 'TODO')
  .replace(/\{\{SHA256_LINUX\}\}/g, sha256Linux || 'TODO')

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, template, 'utf-8')

console.log(`Homebrew Formula 已生成: ${outputPath}`)
