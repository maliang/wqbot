import { describe, it, expect } from 'vitest'
import { getEmbedderConfig } from './embedder.js'
import type { KnowledgeConfig } from './types.js'

describe('getEmbedderConfig', () => {
  it('有 embedding 配置时返回正确的 EmbedderConfig', () => {
    const config: KnowledgeConfig = {
      enabled: true,
      embedding: {
        provider: 'ollama',
        model: 'nomic-embed-text',
      },
    }
    const result = getEmbedderConfig(config)
    expect(result).toEqual({
      provider: 'ollama',
      model: 'nomic-embed-text',
      customName: undefined,
    })
  })

  it('无 embedding 配置时返回 null', () => {
    const config: KnowledgeConfig = {
      enabled: true,
    }
    expect(getEmbedderConfig(config)).toBeNull()
  })

  it('embedding 为 undefined 时返回 null', () => {
    const config: KnowledgeConfig = {
      enabled: true,
      embedding: undefined,
    }
    expect(getEmbedderConfig(config)).toBeNull()
  })

  it('customName 正确传递', () => {
    const config: KnowledgeConfig = {
      enabled: true,
      embedding: {
        provider: 'custom',
        model: 'my-embed-model',
        customName: 'openrouter',
      },
    }
    const result = getEmbedderConfig(config)
    expect(result).toEqual({
      provider: 'custom',
      model: 'my-embed-model',
      customName: 'openrouter',
    })
  })

  it('不同 provider 类型正确映射', () => {
    const providers = ['openai', 'anthropic', 'google', 'groq'] as const
    for (const provider of providers) {
      const config: KnowledgeConfig = {
        embedding: { provider, model: 'test-model' },
      }
      const result = getEmbedderConfig(config)
      expect(result!.provider).toBe(provider)
      expect(result!.model).toBe('test-model')
    }
  })
})
