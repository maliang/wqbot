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
    getAgentsDir: () => '/mock/agents',
  }),
}))

vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue(['test-agent.md']),
}))

import * as fs from 'node:fs'
import { AgentLoader, isReadonlyAgent, getAllowedTools, getDeniedTools, getAgentLoader } from '../src/agent-loader.js'

describe('AgentLoader', () => {
  let loader: AgentLoader

  beforeEach(() => {
    vi.clearAllMocks()
    loader = new AgentLoader()
  })

  describe('parseAgentFile', () => {
    it('parses valid agent file', () => {
      const mockContent = `---
name: test-agent
description: A test agent
mode: primary
triggers:
  - "test"
  - "demo"
---

This is the agent prompt.`

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)

      const result = loader.parseAgentFile('/path/to/test-agent.md')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('test-agent')
      expect(result!.description).toBe('A test agent')
      expect(result!.mode).toBe('primary')
      expect(result!.triggers).toEqual(['test', 'demo'])
      expect(result!.prompt).toBe('This is the agent prompt.')
    })

    it('returns null for invalid config', () => {
      const mockContent = `---
invalid: config
---

Prompt`

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)

      const result = loader.parseAgentFile('/path/to/invalid.md')

      expect(result).toBeNull()
    })

    it('returns null for file read error', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error')
      })

      const result = loader.parseAgentFile('/path/to/missing.md')

      expect(result).toBeNull()
    })

    it('applies default values', () => {
      const mockContent = `---
name: minimal-agent
---

Prompt`

      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)

      const result = loader.parseAgentFile('/path/to/minimal.md')

      expect(result!.description).toBe('')
      expect(result!.mode).toBe('all')
      expect(result!.hidden).toBe(false)
      expect(result!.triggers).toEqual([])
      expect(result!.readonly).toBe(false)
    })
  })

  describe('scanDirectory', () => {
    it('returns empty array for non-existent directory', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = await loader.scanDirectory('/nonexistent')

      expect(result).toEqual([])
    })

    it('scans directory and returns agents', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const mockContent = `---
name: scanned-agent
description: Scanned
---
Prompt`
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent)

      const result = await loader.scanDirectory('/mock/agents')

      expect(result.length).toBe(1)
      expect(result[0]!.name).toBe('scanned-agent')
    })
  })
})

describe('isReadonlyAgent', () => {
  it('returns true for readonly agent', () => {
    const agent = {
      name: 'readonly-agent',
      description: '',
      prompt: '',
      mode: 'primary' as const,
      hidden: false,
      triggers: [],
      filePath: '',
      readonly: true,
    }
    expect(isReadonlyAgent(agent)).toBe(true)
  })

  it('returns true for review mode', () => {
    const agent = {
      name: 'review-agent',
      description: '',
      prompt: '',
      mode: 'review' as const,
      hidden: false,
      triggers: [],
      filePath: '',
      readonly: false,
    }
    expect(isReadonlyAgent(agent)).toBe(true)
  })

  it('returns true for plan alias', () => {
    const agent = {
      name: 'plan-agent',
      description: '',
      prompt: '',
      mode: 'primary' as const,
      hidden: false,
      triggers: [],
      filePath: '',
      readonly: false,
      alias: 'plan' as const,
    }
    expect(isReadonlyAgent(agent)).toBe(true)
  })

  it('returns false for regular agent', () => {
    const agent = {
      name: 'regular-agent',
      description: '',
      prompt: '',
      mode: 'primary' as const,
      hidden: false,
      triggers: [],
      filePath: '',
      readonly: false,
    }
    expect(isReadonlyAgent(agent)).toBe(false)
  })
})

describe('getAllowedTools', () => {
  it('returns custom allowed tools if defined', () => {
    const agent = {
      name: 'custom-tools',
      description: '',
      prompt: '',
      mode: 'primary' as const,
      hidden: false,
      triggers: [],
      filePath: '',
      readonly: false,
      allowedTools: ['read', 'write'],
    }
    expect(getAllowedTools(agent)).toEqual(['read', 'write'])
  })

  it('returns read-only tools for readonly agent', () => {
    const agent = {
      name: 'readonly',
      description: '',
      prompt: '',
      mode: 'review' as const,
      hidden: false,
      triggers: [],
      filePath: '',
      readonly: false,
    }
    const tools = getAllowedTools(agent)
    expect(tools).toContain('read')
    expect(tools).toContain('grep')
    expect(tools).not.toContain('write')
  })
})

describe('getDeniedTools', () => {
  it('returns custom denied tools if defined', () => {
    const agent = {
      name: 'denied-tools',
      description: '',
      prompt: '',
      mode: 'primary' as const,
      hidden: false,
      triggers: [],
      filePath: '',
      readonly: false,
      deniedTools: ['bash', 'eval'],
    }
    expect(getDeniedTools(agent)).toEqual(['bash', 'eval'])
  })

  it('denies write tools for readonly agent', () => {
    const agent = {
      name: 'readonly',
      description: '',
      prompt: '',
      mode: 'review' as const,
      hidden: false,
      triggers: [],
      filePath: '',
      readonly: false,
    }
    const tools = getDeniedTools(agent)
    expect(tools).toContain('write')
    expect(tools).toContain('edit')
  })
})

describe('getAgentLoader', () => {
  it('returns singleton instance', () => {
    const instance1 = getAgentLoader()
    const instance2 = getAgentLoader()
    expect(instance1).toBe(instance2)
  })
})
