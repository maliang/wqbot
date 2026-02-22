import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getProviderApiKey: vi.fn().mockResolvedValue('test-api-key'),
  getProviderBaseUrl: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    languageModel: vi.fn((id) => ({ id })),
  })),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => ({
    languageModel: vi.fn((id) => ({ id })),
  })),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => ({
    languageModel: vi.fn((id) => ({ id })),
  })),
}))

vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn(() => ({
    languageModel: vi.fn((id) => ({ id })),
  })),
}))

import { getSDK, getLanguageModel, clearSDKCache } from '../src/provider.js'

describe('Provider', () => {
  beforeEach(() => {
    clearSDKCache()
    vi.clearAllMocks()
  })

  describe('getSDK', () => {
    it('returns OpenAI SDK for openai provider', async () => {
      const sdk = await getSDK('openai')
      expect(sdk).toBeDefined()
      expect(sdk.languageModel).toBeDefined()
    })

    it('returns Anthropic SDK for anthropic provider', async () => {
      const sdk = await getSDK('anthropic')
      expect(sdk).toBeDefined()
      expect(sdk.languageModel).toBeDefined()
    })

    it('returns Google SDK for google provider', async () => {
      const sdk = await getSDK('google')
      expect(sdk).toBeDefined()
      expect(sdk.languageModel).toBeDefined()
    })

    it('returns Groq SDK for groq provider', async () => {
      const sdk = await getSDK('groq')
      expect(sdk).toBeDefined()
      expect(sdk.languageModel).toBeDefined()
    })

    it('returns OpenAI-compatible SDK for deepseek provider', async () => {
      const sdk = await getSDK('deepseek')
      expect(sdk).toBeDefined()
      expect(sdk.languageModel).toBeDefined()
    })

    it('returns OpenAI-compatible SDK for ollama provider', async () => {
      const sdk = await getSDK('ollama')
      expect(sdk).toBeDefined()
      expect(sdk.languageModel).toBeDefined()
    })

    it('returns OpenAI-compatible SDK for custom provider', async () => {
      const sdk = await getSDK('custom')
      expect(sdk).toBeDefined()
      expect(sdk.languageModel).toBeDefined()
    })

    it('throws for unsupported provider', async () => {
      await expect(getSDK('unsupported' as 'openai')).rejects.toThrow('不支持的 provider')
    })

    it('caches SDK instances', async () => {
      const sdk1 = await getSDK('openai')
      const sdk2 = await getSDK('openai')
      expect(sdk1).toBe(sdk2)
    })

    it('uses custom name in cache key', async () => {
      const sdk1 = await getSDK('custom', 'custom-endpoint-1')
      const sdk2 = await getSDK('custom', 'custom-endpoint-2')
      expect(sdk1).not.toBe(sdk2)
    })
  })

  describe('getLanguageModel', () => {
    it('returns language model for given provider and model id', async () => {
      const model = await getLanguageModel('openai', 'gpt-4o')
      expect(model).toBeDefined()
      expect(model.id).toBe('gpt-4o')
    })

    it('extracts actual model id from prefixed format', async () => {
      const model = await getLanguageModel('custom', 'openrouter/gpt-4o', 'openrouter')
      expect(model).toBeDefined()
      expect(model.id).toBe('gpt-4o')
    })

    it('handles nested path in model id', async () => {
      const model = await getLanguageModel('custom', 'provider/org/model', 'custom-endpoint')
      expect(model).toBeDefined()
      expect(model.id).toBe('org/model')
    })
  })

  describe('clearSDKCache', () => {
    it('clears all cached SDK instances', async () => {
      await getSDK('openai')
      await getSDK('anthropic')

      clearSDKCache()

      // After clear, should create new instances
      const { createOpenAI } = await import('@ai-sdk/openai')
      const initialCallCount = vi.mocked(createOpenAI).mock.calls.length

      await getSDK('openai')

      expect(vi.mocked(createOpenAI).mock.calls.length).toBe(initialCallCount + 1)
    })
  })
})
