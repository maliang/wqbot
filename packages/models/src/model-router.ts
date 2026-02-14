import { streamText, generateText } from 'ai'
import {
  type TaskType,
  type TaskComplexity,
  type ModelProvider,
  type RoutingStrategy,
  type ModelContextInfo,
  getConfigManager,
  createModuleLogger,
} from '@wqbot/core'
import { getLanguageModel, clearSDKCache } from './provider.js'

const logger = createModuleLogger('model-router')

export interface ChatMessage {
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
}

export interface ChatResponse {
  readonly content: string
  readonly model: string
  readonly usage?: {
    readonly promptTokens: number
    readonly completionTokens: number
    readonly totalTokens: number
  }
}

export interface ChatOptions {
  readonly model?: string
  readonly taskType?: TaskType
  readonly complexity?: TaskComplexity
  readonly preferredProvider?: ModelProvider
  readonly localOnly?: boolean
  readonly temperature?: number
  readonly maxTokens?: number
  readonly tools?: Record<string, unknown>
  readonly systemPrompt?: string
}

// ModelInfo 是 ModelContextInfo 的别名（向后兼容）
export type ModelInfo = ModelContextInfo

// 内置模型上下文窗口大小
const MODEL_CONTEXT_WINDOWS: Record<string, { contextWindow: number; maxOutputTokens: number }> = {
  'gpt-4o': { contextWindow: 128000, maxOutputTokens: 16384 },
  'gpt-4o-mini': { contextWindow: 128000, maxOutputTokens: 16384 },
  'o1': { contextWindow: 200000, maxOutputTokens: 100000 },
  'o3': { contextWindow: 200000, maxOutputTokens: 100000 },
  'o3-mini': { contextWindow: 200000, maxOutputTokens: 100000 },
  'claude-sonnet-4-20250514': { contextWindow: 200000, maxOutputTokens: 16384 },
  'claude-haiku-3-5-20241022': { contextWindow: 200000, maxOutputTokens: 8192 },
  'claude-opus-4-20250514': { contextWindow: 200000, maxOutputTokens: 32768 },
  'deepseek-chat': { contextWindow: 64000, maxOutputTokens: 8192 },
  'llama3:8b': { contextWindow: 8192, maxOutputTokens: 2048 },
  'llama3-70b-8192': { contextWindow: 8192, maxOutputTokens: 2048 },
  'mixtral-8x7b-32768': { contextWindow: 32768, maxOutputTokens: 4096 },
}

// 默认值（未知模型）
const DEFAULT_MODEL_INFO: ModelInfo = { contextWindow: 8192, maxOutputTokens: 4096 }

// 构建带可选 customName 的结果对象（兼容 exactOptionalPropertyTypes）
function withCustomName<T extends Record<string, unknown>>(
  base: T,
  customName: string | undefined
): T & { customName?: string } {
  if (customName) return { ...base, customName }
  return base
}

export class ModelRouter {
  private readonly availableProviders: Set<ModelProvider> = new Set()

  async initialize(): Promise<void> {
    clearSDKCache()
    const config = getConfigManager()
    const providers: ModelProvider[] = ['openai', 'anthropic', 'deepseek', 'groq', 'ollama']

    for (const provider of providers) {
      if (!config.isProviderEnabled(provider)) continue

      // Ollama 不需要 API Key
      if (provider === 'ollama') {
        this.availableProviders.add(provider)
        logger.info(`${provider} provider 已启用`)
        continue
      }

      const apiKey = config.getProviderApiKey(provider)
      if (apiKey) {
        this.availableProviders.add(provider)
        logger.info(`${provider} provider 已启用`)
      }
    }

    // 检测 custom 端点
    const customNames = config.getCustomEndpointNames()
    if (customNames.length > 0) {
      this.availableProviders.add('custom')
      logger.info(`custom provider 已启用 (${customNames.join(', ')})`)
    }

    logger.info(`模型路由初始化完成，${this.availableProviders.size} 个 provider 可用`)
  }

  /**
   * 获取模型元数据（上下文窗口、最大输出 token）
   * 支持别名输入（如 "sonnet" → "claude-sonnet-4-20250514"）
   */
  getModelInfo(modelId?: string): ModelInfo {
    if (!modelId) return DEFAULT_MODEL_INFO

    // 别名解析：将别名转为实际模型 ID
    const config = getConfigManager()
    const aliasResult = config.resolveAlias(modelId)
    const resolvedId = aliasResult ? aliasResult.modelId : modelId

    // 精确匹配
    if (MODEL_CONTEXT_WINDOWS[resolvedId]) {
      return MODEL_CONTEXT_WINDOWS[resolvedId]
    }

    // 前缀匹配（如 claude-sonnet-4-xxx 匹配 claude-sonnet-4-20250514）
    for (const [key, info] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      if (resolvedId.startsWith(key.split('-').slice(0, -1).join('-')) || key.startsWith(resolvedId)) {
        return info
      }
    }

    return DEFAULT_MODEL_INFO
  }

  /**
   * 流式对话 — 返回 AsyncGenerator<string>
   */
  async *chatStream(
    messages: readonly ChatMessage[],
    options: ChatOptions = {}
  ): AsyncGenerator<string> {
    const { provider, model, customName } = this.selectModel(options)

    logger.debug(`流式路由到 ${provider}/${model}`, {
      taskType: options.taskType,
      complexity: options.complexity,
    })

    const languageModel = getLanguageModel(provider, model, customName)
    const callOpts: Record<string, unknown> = {
      model: languageModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }
    if (options.temperature !== undefined) callOpts.temperature = options.temperature
    if (options.maxTokens !== undefined) callOpts.maxTokens = options.maxTokens
    if (options.systemPrompt) callOpts.system = options.systemPrompt
    if (options.tools && Object.keys(options.tools).length > 0) {
      callOpts.tools = options.tools
      callOpts.maxSteps = 5
    }

    const result = streamText(callOpts as Parameters<typeof streamText>[0])

    for await (const chunk of (await result).textStream) {
      yield chunk
    }
  }

  /**
   * 非流式对话 — 返回完整响应
   */
  async chatSync(
    messages: readonly ChatMessage[],
    options: ChatOptions = {}
  ): Promise<ChatResponse> {
    const { provider, model, customName } = this.selectModel(options)

    logger.debug(`同步路由到 ${provider}/${model}`, {
      taskType: options.taskType,
      complexity: options.complexity,
    })

    const languageModel = getLanguageModel(provider, model, customName)
    const callOpts: Record<string, unknown> = {
      model: languageModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }
    if (options.temperature !== undefined) callOpts.temperature = options.temperature
    if (options.maxTokens !== undefined) callOpts.maxTokens = options.maxTokens
    if (options.systemPrompt) callOpts.system = options.systemPrompt
    if (options.tools && Object.keys(options.tools).length > 0) {
      callOpts.tools = options.tools
      callOpts.maxSteps = 5
    }

    const result = await generateText(callOpts as Parameters<typeof generateText>[0])

    const response: ChatResponse = {
      content: result.text,
      model,
    }

    if (result.usage) {
      return {
        ...response,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.promptTokens + result.usage.completionTokens,
        },
      }
    }

    return response
  }

  private selectModel(options: ChatOptions): { provider: ModelProvider; model: string; customName?: string } {
    const config = getConfigManager()

    if (options.model) {
      // 1. 先尝试别名解析
      const aliasResult = config.resolveAlias(options.model)
      if (aliasResult) {
        const model = aliasResult.customName
          ? `${aliasResult.customName}/${aliasResult.modelId}`
          : aliasResult.modelId
        return withCustomName(
          { provider: aliasResult.provider as ModelProvider, model },
          aliasResult.customName,
        )
      }

      // 2. 非别名，走 findProviderForModel
      const found = this.findProviderForModel(options.model)
      if (found) {
        return withCustomName(
          { provider: found.provider, model: options.model },
          found.customName,
        )
      }
    }

    // 指定了 provider
    if (options.preferredProvider && this.availableProviders.has(options.preferredProvider)) {
      const model = this.getDefaultModelForProvider(options.preferredProvider)
      return { provider: options.preferredProvider, model }
    }

    // 仅本地模式
    if (options.localOnly) {
      if (this.availableProviders.has('ollama')) {
        return { provider: 'ollama', model: 'llama3:8b' }
      }
      throw new Error('没有可用的本地模型')
    }

    // 按任务类型路由
    if (options.taskType) {
      const models = config.getModelsForTask(options.taskType)
      for (const modelId of models) {
        const found = this.findProviderForModel(modelId)
        if (found && this.availableProviders.has(found.provider)) {
          return withCustomName(
            { provider: found.provider, model: modelId },
            found.customName,
          )
        }
      }
    }

    // 按策略和复杂度路由
    const strategy = config.getRoutingStrategy()
    return this.selectByStrategy(strategy, options.complexity ?? 'medium')
  }

  private selectByStrategy(
    strategy: RoutingStrategy,
    complexity: TaskComplexity
  ): { provider: ModelProvider; model: string } {
    const config = getConfigManager()
    const fallbackChain = config.getFallbackChain()

    if (strategy === 'quality') {
      for (const provider of fallbackChain) {
        if (this.availableProviders.has(provider)) {
          return { provider, model: this.getBestModelForProvider(provider) }
        }
      }
    }

    if (strategy === 'economy') {
      if (this.availableProviders.has('ollama')) {
        return { provider: 'ollama', model: 'llama3:8b' }
      }
      if (this.availableProviders.has('openai')) {
        return { provider: 'openai', model: 'gpt-4o-mini' }
      }
      if (this.availableProviders.has('anthropic')) {
        return { provider: 'anthropic', model: 'claude-haiku-3-5-20241022' }
      }
    }

    // balanced 策略：按复杂度选择
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

    // 默认：fallback chain 中第一个可用的
    for (const provider of fallbackChain) {
      if (this.availableProviders.has(provider)) {
        return { provider, model: this.getDefaultModelForProvider(provider) }
      }
    }

    throw new Error('没有可用的模型')
  }

  private findProviderForModel(modelId: string): { provider: ModelProvider; customName?: string } | null {
    const config = getConfigManager()

    // 1. "xxx/model" 格式
    if (modelId.includes('/')) {
      const prefix = modelId.split('/')[0]!
      // 检查是否是 custom 端点名
      if (config.getCustomEndpointNames().includes(prefix)) {
        return { provider: 'custom', customName: prefix }
      }
      return { provider: prefix as ModelProvider }
    }

    // 2. 前缀匹配
    if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3')) {
      return { provider: 'openai' }
    }
    if (modelId.startsWith('claude-')) {
      return { provider: 'anthropic' }
    }
    if (modelId.startsWith('deepseek')) {
      return { provider: 'deepseek' }
    }
    if (modelId.startsWith('llama') || modelId.startsWith('mixtral') || modelId.startsWith('gemma')) {
      return { provider: 'groq' }
    }
    if (modelId.includes(':')) {
      return { provider: 'ollama' }
    }

    // 3. 遍历 custom 端点的 models 列表反向查找
    for (const name of config.getCustomEndpointNames()) {
      const endpoint = config.getCustomEndpoint(name)
      for (const entry of endpoint?.models ?? []) {
        const id = typeof entry === 'string' ? entry : entry.id
        if (id === modelId) {
          return { provider: 'custom', customName: name }
        }
      }
    }

    return null
  }

  private getDefaultModelForProvider(provider: ModelProvider): string {
    const defaults: Record<string, string> = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-sonnet-4-20250514',
      ollama: 'llama3:8b',
      deepseek: 'deepseek-chat',
      google: 'gemini-pro',
      groq: 'llama3-70b-8192',
    }
    return defaults[provider] ?? 'gpt-4o-mini'
  }

  private getBestModelForProvider(provider: ModelProvider): string {
    const best: Record<string, string> = {
      openai: 'gpt-4o',
      anthropic: 'claude-sonnet-4-20250514',
      ollama: 'llama3:8b',
      deepseek: 'deepseek-chat',
      groq: 'llama3-70b-8192',
    }
    return best[provider] ?? this.getDefaultModelForProvider(provider)
  }

  getAvailableProviders(): readonly ModelProvider[] {
    return [...this.availableProviders]
  }
}

// Singleton
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
