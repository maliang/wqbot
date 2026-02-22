import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getConfigManager: () => ({
    isProviderEnabled: vi.fn().mockReturnValue(true),
    getProviderApiKey: vi.fn().mockReturnValue('test-key'),
    getCustomEndpointNames: vi.fn().mockReturnValue([]),
    getFallbackChain: vi.fn().mockReturnValue(['openai', 'anthropic']),
    getRoutingStrategy: vi.fn().mockReturnValue('balanced'),
    resolveAlias: vi.fn().mockReturnValue(null),
    getModelsForTask: vi.fn().mockReturnValue([]),
    getCustomEndpoint: vi.fn().mockReturnValue(null),
  }),
}))

vi.mock('../src/provider.js', () => ({
  getLanguageModel: vi.fn().mockResolvedValue({ id: 'test-model' }),
  clearSDKCache: vi.fn(),
}))

import { ModelRouter, getModelRouter } from '../src/model-router.js'

describe('ModelRouter', () => {
  let router: ModelRouter

  beforeEach(async () => {
    vi.clearAllMocks()
    router = new ModelRouter()
    await router.initialize()
  })

  describe('initialize', () => {
    it('initializes available providers', async () => {
      const newRouter = new ModelRouter()
      await newRouter.initialize()
      expect(newRouter.getAvailableProviders().length).toBeGreaterThan(0)
    })
  })

  describe('getModelInfo', () => {
    it('returns info for known models', () => {
      const info = router.getModelInfo('gpt-4o')
      expect(info.contextWindow).toBe(128000)
      expect(info.maxOutputTokens).toBe(16384)
    })

    it('returns default info for unknown models', () => {
      const info = router.getModelInfo('xyz-unknown-model-123')
      // Default model info should be returned for truly unknown models
      expect(info.contextWindow).toBe(8192)
      expect(info.maxOutputTokens).toBe(4096)
    })

    it('returns default info when no model specified', () => {
      const info = router.getModelInfo()
      expect(info.contextWindow).toBe(8192)
    })

    it('handles claude models', () => {
      const info = router.getModelInfo('claude-sonnet-4-20250514')
      expect(info.contextWindow).toBe(200000)
    })

    it('handles o1 models', () => {
      const info = router.getModelInfo('o1')
      expect(info.contextWindow).toBe(200000)
    })

    it('handles deepseek models', () => {
      const info = router.getModelInfo('deepseek-chat')
      expect(info.contextWindow).toBe(64000)
    })
  })

  describe('getAvailableProviders', () => {
    it('returns list of available providers', () => {
      const providers = router.getAvailableProviders()
      expect(Array.isArray(providers)).toBe(true)
    })
  })

  describe('selectModel (via getModelInfo)', () => {
    it('handles model with prefix format', () => {
      // Provider should be detected from prefix
      const info = router.getModelInfo('openai/gpt-4o')
      expect(info).toBeDefined()
    })
  })
})

describe('getModelRouter', () => {
  it('returns singleton instance', () => {
    const instance1 = getModelRouter()
    const instance2 = getModelRouter()
    expect(instance1).toBe(instance2)
  })
})
