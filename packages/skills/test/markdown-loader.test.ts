import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getConfigManager: () => ({
    getSkillsDir: () => '/mock/skills',
  }),
}))

vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue(['my-skill/SKILL.md']),
}))

import * as fs from 'node:fs'
import { MarkdownSkillLoader, getMarkdownSkillLoader } from '../src/markdown-loader.js'

describe('MarkdownSkillLoader', () => {
  let loader: MarkdownSkillLoader

  beforeEach(() => {
    vi.clearAllMocks()
    loader = new MarkdownSkillLoader()
  })

  describe('parseSkillFile', () => {
    it('parses valid skill file', () => {
      const mockContent = `---
name: my-skill
description: A test skill
model: gpt-4o
subtask: true
---

This is the skill content.

## Instructions
- Step 1
- Step 2`

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)

      const result = loader.parseSkillFile('/path/to/my-skill/SKILL.md')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('my-skill')
      expect(result!.description).toBe('A test skill')
      expect(result!.model).toBe('gpt-4o')
      expect(result!.subtask).toBe(true)
      expect(result!.content).toContain('This is the skill content')
    })

    it('uses directory name as fallback', () => {
      const mockContent = `---
description: Skill without name
---

Content`

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)

      const result = loader.parseSkillFile('/path/to/fallback-name/SKILL.md')

      expect(result!.name).toBe('fallback-name')
    })

    it('returns null for file read error', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error')
      })

      const result = loader.parseSkillFile('/path/to/missing/SKILL.md')

      expect(result).toBeNull()
    })

    it('applies default values', () => {
      const mockContent = `---
name: minimal-skill
---

Content`

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)

      const result = loader.parseSkillFile('/path/to/minimal/SKILL.md')

      expect(result!.description).toBe('')
      expect(result!.model).toBeUndefined()
      expect(result!.subtask).toBeUndefined()
    })
  })

  describe('scanDirectory', () => {
    it('returns empty array for non-existent directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await loader.scanDirectory('/nonexistent')

      expect(result).toEqual([])
    })

    it('scans directory and returns skills', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const mockContent = `---
name: scanned-skill
description: Scanned
---
Content`
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)

      const result = await loader.scanDirectory('/mock/skills')

      expect(result.length).toBe(1)
      expect(result[0]!.name).toBe('scanned-skill')
    })
  })
})

describe('getMarkdownSkillLoader', () => {
  it('returns singleton instance', () => {
    const instance1 = getMarkdownSkillLoader()
    const instance2 = getMarkdownSkillLoader()
    expect(instance1).toBe(instance2)
  })
})
