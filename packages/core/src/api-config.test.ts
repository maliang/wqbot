import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./logger.js', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { expandVariables, ApiConfigSchema } from './api-config.js'

describe('expandVariables', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('{env:VAR} 替换', () => {
    process.env.TEST_API_KEY = 'sk-test-123'
    expect(expandVariables('{env:TEST_API_KEY}')).toBe('sk-test-123')
  })

  it('${VAR} 兼容语法', () => {
    process.env.MY_SECRET = 'secret-value'
    expect(expandVariables('${MY_SECRET}')).toBe('secret-value')
  })

  it('未设置变量返回空', () => {
    delete process.env.NONEXIST_VAR_12345
    expect(expandVariables('{env:NONEXIST_VAR_12345}')).toBe('')
  })

  it('无变量原样返回', () => {
    expect(expandVariables('plain-string')).toBe('plain-string')
  })
})

describe('ApiConfigSchema', () => {
  it('验证合法配置', () => {
    const config = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      openai: { apiKey: 'sk-xxx' },
      anthropic: { apiKey: 'sk-ant-xxx' },
    }
    const result = ApiConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('空对象通过', () => {
    const result = ApiConfigSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('非法字段拒绝', () => {
    const result = ApiConfigSchema.safeParse({
      openai: { apiKey: 123 },
    })
    expect(result.success).toBe(false)
  })
})
