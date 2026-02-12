import type { ModelProvider, ModelConfig } from '@wqbot/core'

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
  } | undefined
  readonly finishReason?: string | undefined
}

export interface ProviderOptions {
  readonly apiKey?: string | undefined
  readonly baseUrl?: string | undefined
  readonly timeout?: number | undefined
  readonly maxRetries?: number | undefined
}

export abstract class BaseProvider {
  readonly provider: ModelProvider
  protected readonly options: ProviderOptions

  constructor(provider: ModelProvider, options: ProviderOptions = {}) {
    this.provider = provider
    this.options = {
      timeout: 60000,
      maxRetries: 3,
      ...options,
    }
  }

  abstract chat(
    messages: readonly ChatMessage[],
    model: string,
    options?: {
      temperature?: number
      maxTokens?: number
      stopSequences?: readonly string[]
    }
  ): Promise<ChatResponse>

  abstract listModels(): Promise<readonly ModelConfig[]>

  abstract isAvailable(): Promise<boolean>

  protected validateApiKey(): void {
    if (!this.options.apiKey) {
      throw new Error(`API key not configured for provider: ${this.provider}`)
    }
  }
}
