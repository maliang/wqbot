import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { HookLoader, getHookLoader } from '../src/hook-loader.js'

describe('HookLoader', () => {
  let loader: HookLoader
  let tempDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-test-'))
    loader = new HookLoader(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('loadAll', () => {
    it('returns empty array when no hooks directory', async () => {
      const result = await loader.loadAll()
      expect(result).toEqual([])
    })

    it('loads hooks from directory', async () => {
      const hooksDir = path.join(tempDir, '.wqbot', 'hooks')
      await fs.mkdir(hooksDir, { recursive: true })

      const hookContent = `---
name: test-hook
description: A test hook
event: tool:before
---

Hook content here.`

      await fs.writeFile(path.join(hooksDir, 'test-hook.md'), hookContent)

      const result = await loader.loadAll()

      expect(result.length).toBe(1)
      expect(result[0]!.name).toBe('test-hook')
      expect(result[0]!.description).toBe('A test hook')
    })

    it('ignores non-markdown files', async () => {
      const hooksDir = path.join(tempDir, '.wqbot', 'hooks')
      await fs.mkdir(hooksDir, { recursive: true })

      await fs.writeFile(path.join(hooksDir, 'test.txt'), 'not a hook')
      await fs.writeFile(path.join(hooksDir, 'valid.md'), `---
name: valid
event: tool:before
---
content`)

      const result = await loader.loadAll()

      expect(result.length).toBe(1)
      expect(result[0]!.name).toBe('valid')
    })

    it('skips files with invalid frontmatter', async () => {
      const hooksDir = path.join(tempDir, '.wqbot', 'hooks')
      await fs.mkdir(hooksDir, { recursive: true })

      await fs.writeFile(path.join(hooksDir, 'invalid.md'), 'no frontmatter')
      await fs.writeFile(path.join(hooksDir, 'valid.md'), `---
name: valid
event: tool:before
---
content`)

      const result = await loader.loadAll()

      expect(result.length).toBe(1)
    })

    it('project hooks override global hooks', async () => {
      // Create global hook
      const globalDir = path.join(os.homedir(), '.wqbot', 'hooks')
      await fs.mkdir(globalDir, { recursive: true })

      const globalHook = `---
name: override-test
description: Global version
event: tool:before
---
global`

      await fs.writeFile(path.join(globalDir, 'override-test.md'), globalHook)

      // Create project hook
      const projectDir = path.join(tempDir, '.wqbot', 'hooks')
      await fs.mkdir(projectDir, { recursive: true })

      const projectHook = `---
name: override-test
description: Project version
event: tool:before
---
project`

      await fs.writeFile(path.join(projectDir, 'override-test.md'), projectHook)

      const result = await loader.loadAll()

      expect(result.length).toBe(1)
      expect(result[0]!.description).toBe('Project version')
      expect(result[0]!.source).toBe('project')

      // Cleanup
      await fs.rm(path.join(globalDir, 'override-test.md'), { force: true })
    })
  })

  describe('getDirectories', () => {
    it('returns global and project directories', () => {
      const dirs = loader.getDirectories()

      expect(dirs.global).toContain('.wqbot')
      expect(dirs.project).toContain('.wqbot')
    })
  })

  describe('hook parsing', () => {
    it('parses patterns as regex', async () => {
      const hooksDir = path.join(tempDir, '.wqbot', 'hooks')
      await fs.mkdir(hooksDir, { recursive: true })

      // Use inline array format which the simple parser can handle
      const hookContent = `---
name: regex-hook
event: tool:before
patterns: ["TODO:", "FIXME:"]
---
content`

      await fs.writeFile(path.join(hooksDir, 'regex-hook.md'), hookContent)

      const result = await loader.loadAll()

      expect(result.length).toBe(1)
      expect(result[0]!.compiledPatterns).toBeDefined()
      expect(result[0]!.compiledPatterns!.length).toBe(2)
    })

    it('handles invalid regex patterns', async () => {
      const hooksDir = path.join(tempDir, '.wqbot', 'hooks')
      await fs.mkdir(hooksDir, { recursive: true })

      const hookContent = `---
name: bad-regex
event: tool:before
patterns: ["[invalid(", "valid"]
---
content`

      await fs.writeFile(path.join(hooksDir, 'bad-regex.md'), hookContent)

      const result = await loader.loadAll()

      expect(result.length).toBe(1)
      // Should only have the valid pattern
      expect(result[0]!.compiledPatterns!.length).toBe(1)
    })

    it('parses boolean values', async () => {
      const hooksDir = path.join(tempDir, '.wqbot', 'hooks')
      await fs.mkdir(hooksDir, { recursive: true })

      const hookContent = `---
name: bool-hook
event: tool:before
enabled: true
---
content`

      await fs.writeFile(path.join(hooksDir, 'bool-hook.md'), hookContent)

      const result = await loader.loadAll()

      expect(result.length).toBe(1)
      expect(result[0]!.enabled).toBe(true)
    })
  })
})

describe('getHookLoader', () => {
  it('returns singleton instance', () => {
    const instance1 = getHookLoader()
    const instance2 = getHookLoader()
    expect(instance1).toBe(instance2)
  })
})
