import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { jsonSchemaToZod, convertToAITools } from '../src/tool-adapter.js'

describe('jsonSchemaToZod', () => {
  it('string', () => {
    const schema = jsonSchemaToZod({ type: 'string' })
    expect(schema.parse('hello')).toBe('hello')
    expect(() => schema.parse(123)).toThrow()
  })

  it('number', () => {
    const schema = jsonSchemaToZod({ type: 'number' })
    expect(schema.parse(42)).toBe(42)
    expect(() => schema.parse('abc')).toThrow()
  })

  it('boolean', () => {
    const schema = jsonSchemaToZod({ type: 'boolean' })
    expect(schema.parse(true)).toBe(true)
    expect(() => schema.parse('yes')).toThrow()
  })

  it('object + required', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    })
    // required 字段必填
    expect(schema.parse({ name: 'Alice' })).toEqual({ name: 'Alice' })
    expect(schema.parse({ name: 'Bob', age: 30 })).toEqual({ name: 'Bob', age: 30 })
    expect(() => schema.parse({ age: 30 })).toThrow()
  })

  it('array', () => {
    const schema = jsonSchemaToZod({
      type: 'array',
      items: { type: 'string' },
    })
    expect(schema.parse(['a', 'b'])).toEqual(['a', 'b'])
    expect(() => schema.parse([1, 2])).toThrow()
  })

  it('enum', () => {
    const schema = jsonSchemaToZod({
      type: 'string',
      enum: ['a', 'b', 'c'],
    })
    expect(schema.parse('a')).toBe('a')
    expect(() => schema.parse('d')).toThrow()
  })

  it('未知类型 fallback z.any()', () => {
    const schema = jsonSchemaToZod({ type: 'unknown_type' })
    // z.any() 接受任意值
    expect(schema.parse('anything')).toBe('anything')
    expect(schema.parse(123)).toBe(123)
    expect(schema.parse(null)).toBe(null)
  })
})

describe('convertToAITools', () => {
  it('转换工具列表', () => {
    const tools = [
      {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
        source: 'builtin' as const,
        execute: async (args: Record<string, unknown>) => ({
          content: `result: ${args.query}`,
        }),
      },
    ]

    const result = convertToAITools(tools)
    expect(result).toHaveProperty('test_tool')
    expect(result.test_tool).toBeDefined()
  })

  it('转换多个工具', () => {
    const tools = [
      {
        name: 'tool1',
        description: 'First tool',
        inputSchema: { type: 'object', properties: {} },
        source: 'builtin' as const,
        execute: async () => ({ content: 'ok' }),
      },
      {
        name: 'tool2',
        description: 'Second tool',
        inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
        source: 'skill' as const,
        execute: async () => ({ content: 'ok' }),
      },
    ]

    const result = convertToAITools(tools)
    expect(result).toHaveProperty('tool1')
    expect(result).toHaveProperty('tool2')
  })

  it('空工具列表返回空对象', () => {
    const result = convertToAITools([])
    expect(Object.keys(result).length).toBe(0)
  })
})
