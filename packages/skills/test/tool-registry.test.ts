import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { ToolRegistry, getToolRegistry } from '../src/tool-registry.js'

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  afterEach(() => {
    registry.clear()
  })

  describe('register', () => {
    it('registers a tool', () => {
      const tool = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        source: 'builtin' as const,
        execute: async () => ({ content: 'ok' }),
      }

      registry.register(tool)

      expect(registry.size).toBe(1)
      expect(registry.get('test_tool')).toBe(tool)
    })

    it('overwrites existing tool with warning', () => {
      const tool1 = {
        name: 'duplicate',
        description: 'First',
        inputSchema: {},
        source: 'builtin' as const,
        execute: async () => ({ content: 'first' }),
      }
      const tool2 = {
        name: 'duplicate',
        description: 'Second',
        inputSchema: {},
        source: 'skill' as const,
        execute: async () => ({ content: 'second' }),
      }

      registry.register(tool1)
      registry.register(tool2)

      expect(registry.size).toBe(1)
      expect(registry.get('duplicate')!.description).toBe('Second')
    })
  })

  describe('unregister', () => {
    it('removes a tool', () => {
      const tool = {
        name: 'to_remove',
        description: 'Will be removed',
        inputSchema: {},
        source: 'builtin' as const,
        execute: async () => ({ content: 'ok' }),
      }

      registry.register(tool)
      const result = registry.unregister('to_remove')

      expect(result).toBe(true)
      expect(registry.size).toBe(0)
    })

    it('returns false for non-existent tool', () => {
      const result = registry.unregister('non_existent')
      expect(result).toBe(false)
    })
  })

  describe('get', () => {
    it('returns tool by name', () => {
      const tool = {
        name: 'get_test',
        description: 'Test',
        inputSchema: {},
        source: 'builtin' as const,
        execute: async () => ({ content: 'ok' }),
      }

      registry.register(tool)

      expect(registry.get('get_test')).toBe(tool)
    })

    it('returns undefined for non-existent tool', () => {
      expect(registry.get('non_existent')).toBeUndefined()
    })
  })

  describe('getAll', () => {
    it('returns all registered tools', () => {
      const tool1 = {
        name: 'tool1',
        description: 'Tool 1',
        inputSchema: {},
        source: 'builtin' as const,
        execute: async () => ({ content: '1' }),
      }
      const tool2 = {
        name: 'tool2',
        description: 'Tool 2',
        inputSchema: {},
        source: 'skill' as const,
        execute: async () => ({ content: '2' }),
      }

      registry.register(tool1)
      registry.register(tool2)

      const all = registry.getAll()
      expect(all.length).toBe(2)
    })
  })

  describe('getBySource', () => {
    it('filters tools by source', () => {
      const builtin = {
        name: 'builtin_tool',
        description: 'Builtin',
        inputSchema: {},
        source: 'builtin' as const,
        execute: async () => ({ content: 'builtin' }),
      }
      const skill = {
        name: 'skill_tool',
        description: 'Skill',
        inputSchema: {},
        source: 'skill' as const,
        execute: async () => ({ content: 'skill' }),
      }
      const mcp = {
        name: 'mcp_tool',
        description: 'MCP',
        inputSchema: {},
        source: 'mcp' as const,
        execute: async () => ({ content: 'mcp' }),
      }

      registry.register(builtin)
      registry.register(skill)
      registry.register(mcp)

      expect(registry.getBySource('builtin').length).toBe(1)
      expect(registry.getBySource('skill').length).toBe(1)
      expect(registry.getBySource('mcp').length).toBe(1)
    })
  })

  describe('execute', () => {
    it('executes tool and returns result', async () => {
      const tool = {
        name: 'exec_test',
        description: 'Test',
        inputSchema: {},
        source: 'builtin' as const,
        execute: async (args: Record<string, unknown>) => ({
          content: `Result: ${args.input}`,
        }),
      }

      registry.register(tool)
      const result = await registry.execute('exec_test', { input: 'hello' })

      expect(result.content).toBe('Result: hello')
      expect(result.isError).toBeUndefined()
    })

    it('returns error for non-existent tool', async () => {
      const result = await registry.execute('non_existent', {})

      expect(result.content).toContain('工具不存在')
      expect(result.isError).toBe(true)
    })

    it('handles execution error', async () => {
      const tool = {
        name: 'failing_tool',
        description: 'Fails',
        inputSchema: {},
        source: 'builtin' as const,
        execute: async () => {
          throw new Error('Execution failed')
        },
      }

      registry.register(tool)
      const result = await registry.execute('failing_tool', {})

      expect(result.content).toContain('工具执行失败')
      expect(result.isError).toBe(true)
    })
  })

  describe('size', () => {
    it('returns correct count', () => {
      expect(registry.size).toBe(0)

      registry.register({
        name: 'size_test',
        description: 'Test',
        inputSchema: {},
        source: 'builtin',
        execute: async () => ({ content: 'ok' }),
      })

      expect(registry.size).toBe(1)
    })
  })

  describe('clear', () => {
    it('removes all tools', () => {
      registry.register({
        name: 'clear_test',
        description: 'Test',
        inputSchema: {},
        source: 'builtin',
        execute: async () => ({ content: 'ok' }),
      })

      registry.clear()

      expect(registry.size).toBe(0)
    })
  })
})

describe('getToolRegistry', () => {
  it('returns singleton instance', () => {
    const instance1 = getToolRegistry()
    const instance2 = getToolRegistry()
    expect(instance1).toBe(instance2)
  })
})
