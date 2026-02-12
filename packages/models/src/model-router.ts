import {
  type TaskType,
  type TaskComplexity,
  type ModelProvider,
  type RoutingStrategy,
  getConfigManager,
  createModuleLogger,
} from '@wqbot/core'
import { BaseProvider, type ChatMessage, type ChatResponse } from './base-provider.js'
import { OpenAIProvider } from './openai-provider.js'
import { AnthropicProvider } from './anthropic-provider.js'
import { OllamaProvider } from './ollama-provider.js'

const logger = createModuleLogger('model-router')

interface RouteOptions {
  taskType?: TaskType
  complexity?: TaskComplexity
  preferredProvider?: ModelProvider
  preferredModel?: string
  localOnly?: boolean
}

export class ModelRouter {
  private readonly providers: Map<ModelProvider, BaseProvider> = new Map()
  private readonly availableProviders: Set<ModelProvider> = new Set()

  async initialize(): Promise<void> {
    const config = getConfigManager()

    // Initialize OpenAI provider
    if (config.isProviderEnabled('openai')) {
      const apiKey = config.getProviderApiKey('openai')
      if (apiKey) {
        const provider = new OpenAIProvider({ apiKey })
        this.providers.set('openai', provider)
        if (await provider.isAvailable()) {
          this.availableProviders.add('openai')
          logger.info('OpenAI provider initialized')
        }
      }
    }

    // Initialize Anthropic provider
    if (config.isProviderEnabled('anthropic')) {
      const apiKey = config.getProviderApiKey('anthropic')
      if (apiKey) {
        const provider = new AnthropicProvider({ apiKey })
        this.providers.set('anthropic', provider)
        if (await provider.isAvailable()) {
          this.availableProviders.add('anthropic')
          logger.info('Anthropic provider initialized')
        }
      }
    }

    // Initialize Ollama provider
    if (config.isProviderEnabled('ollama')) {
      const baseUrl = config.getProviderBaseUrl('ollama')
      const provider = new OllamaProvider({ baseUrl })
      this.providers.set('ollama', provider)
      if (await provider.isAvailable()) {
        this.availableProviders.add('ollama')
        logger.info('Ollama provider initialized')
      }
    }

    logger.info(`Model router initialized with ${this.availableProviders.size} providers`)
  }

  async chat(
    messages: readonly ChatMessage[],
    options: RouteOptions = {}
  ): Promise<ChatResponse> {
    const { provider, model } = this.selectModel(options)

    const providerInstance = this.providers.get(provider)
    if (!providerInstance) {
      throw new Error(`Provider not available: ${provider}`)
    }

    logger.debug(`Routing to ${provider}/${model}`, {
      taskType: options.taskType,
      complexity: options.complexity,
    })

    return providerInstance.chat(messages, model)
  }

  private selectModel(options: RouteOptions): { provider: ModelProvider; model: string } {
    const config = getConfigManager()

    // If specific model requested
    if (options.preferredModel) {
      const provider = this.findProviderForModel(options.preferredModel)
      if (provider && this.availableProviders.has(provider)) {
        return { provider, model: options.preferredModel }
      }
    }

    // If specific provider requested
    if (options.preferredProvider && this.availableProviders.has(options.preferredProvider)) {
      const model = this.getDefaultModelForProvider(options.preferredProvider)
      return { provider: options.preferredProvider, model }
    }

    // Local only mode
    if (options.localOnly) {
      if (this.availableProviders.has('ollama')) {
        return { provider: 'ollama', model: 'llama3:8b' }
      }
      throw new Error('No local models available')
    }

    // Route based on task type
    if (options.taskType) {
      const models = config.getModelsForTask(options.taskType)
      for (const modelId of models) {
        const provider = this.findProviderForModel(modelId)
        if (provider && this.availableProviders.has(provider)) {
          return { provider, model: modelId }
        }
      }
    }

    // Route based on strategy and complexity
    const strategy = config.getRoutingStrategy()
    return this.selectByStrategy(strategy, options.complexity ?? 'medium')
  }

  private selectByStrategy(
    strategy: RoutingStrategy,
    complexity: TaskComplexity
  ): { provider: ModelProvider; model: string } {
    const config = getConfigManager()
    const fallbackChain = config.getFallbackChain()

    // Quality strategy: always use best available
    if (strategy === 'quality') {
      for (const provider of fallbackChain) {
        if (this.availableProviders.has(provider)) {
          return { provider, model: this.getBestModelForProvider(provider) }
        }
      }
    }

    // Economy strategy: prefer local/cheap models
    if (strategy === 'economy') {
      if (this.availableProviders.has('ollama')) {
        return { provider: 'ollama', model: 'llama3:8b' }
      }
      // Fall back to cheapest cloud option
      if (this.availableProviders.has('openai')) {
        return { provider: 'openai', model: 'gpt-4o-mini' }
      }
      if (this.availableProviders.has('anthropic')) {
        return { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' }
      }
    }

    // Balanced strategy: based on complexity
    if (complexity === 'low') {
      if (this.availableProviders.has('ollama')) {
        return { provider: 'ollama', model: 'llama3:8b' }
      }
      if (this.availableProviders.has('openai')) {
        return { provider: 'openai', model: 'gpt-4o-mini' }
      }
    }

    if (complexity === 'high') {
      if (this.availableProviders.has('anthropic')) {
        return { provider: 'anthropic', model: 'claude-sonnet-4-20250514' }
      }
      if (this.availableProviders.has('openai')) {
        return { provider: 'openai', model: 'gpt-4o' }
      }
    }

    // Default: first available from fallback chain
    for (const provider of fallbackChain) {
      if (this.availableProviders.has(provider)) {
        return { provider, model: this.getDefaultModelForProvider(provider) }
      }
    }

    throw new Error('No models available')
  }

  private findProviderForModel(modelId: string): ModelProvider | null {
    // Check for provider prefix (e.g., "ollama/llama3:8b")
    if (modelId.includes('/')) {
      const [provider] = modelId.split('/')
      return provider as ModelProvider
    }

    // Infer provider from model name
    if (modelId.startsWith('gpt-') || modelId.startsWith('o1')) {
      return 'openai'
    }
    if (modelId.startsWith('claude-')) {
      return 'anthropic'
    }
    if (modelId.startsWith('deepseek')) {
      return 'deepseek'
    }
    if (modelId.includes(':')) {
      // Ollama models typically have format "model:tag"
      return 'ollama'
    }

    return null
  }

  private getDefaultModelForProvider(provider: ModelProvider): string {
    switch (provider) {
      case 'openai':
        return 'gpt-4o-mini'
      case 'anthropic':
        return 'claude-sonnet-4-20250514'
      case 'ollama':
        return 'llama3:8b'
      case 'deepseek':
        return 'deepseek-chat'
      case 'google':
        return 'gemini-pro'
      case 'groq':
        return 'llama3-70b-8192'
      default:
        return 'gpt-4o-mini'
    }
  }

  private getBestModelForProvider(provider: ModelProvider): string {
    switch (provider) {
      case 'openai':
        return 'gpt-4o'
      case 'anthropic':
        return 'claude-sonnet-4-20250514'
      case 'ollama':
        return 'llama3:8b'
      case 'deepseek':
        return 'deepseek-chat'
      default:
        return this.getDefaultModelForProvider(provider)
    }
  }

  getAvailableProviders(): readonly ModelProvider[] {
    return [...this.availableProviders]
  }

  getProvider(provider: ModelProvider): BaseProvider | undefined {
    return this.providers.get(provider)
  }
}

// Singleton instance
let routerInstance: ModelRouter | null = null

export function getModelRouter(): ModelRouter {
  if (!routerInstance) {
    routerInstance = new ModelRouter()
  }
  return routerInstance
}

export async function initializeModelRouter(): Promise<ModelRouter> {
  const router = getModelRouter()
  await router.initialize()
  return router
}
