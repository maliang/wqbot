import Anthropic from '@anthropic-ai/sdk'
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages'
import type { ModelConfig } from '@wqbot/core'
import { BaseProvider, type ChatMessage, type ChatResponse, type ProviderOptions } from './base-provider.js'

export class AnthropicProvider extends BaseProvider {
  private client: Anthropic | null = null

  constructor(options: ProviderOptions = {}) {
    super('anthropic', options)
  }

  private getClient(): Anthropic {
    if (!this.client) {
      this.validateApiKey()

      const clientOptions: ConstructorParameters<typeof Anthropic>[0] = {
        apiKey: this.options.apiKey,
      }

      if (this.options.baseUrl !== undefined) {
        clientOptions.baseURL = this.options.baseUrl
      }

      if (this.options.timeout !== undefined) {
        clientOptions.timeout = this.options.timeout
      }

      if (this.options.maxRetries !== undefined) {
        clientOptions.maxRetries = this.options.maxRetries
      }

      this.client = new Anthropic(clientOptions)
    }
    return this.client
  }

  async chat(
    messages: readonly ChatMessage[],
    model: string,
    options?: {
      temperature?: number
      maxTokens?: number
      stopSequences?: readonly string[]
    }
  ): Promise<ChatResponse> {
    const client = this.getClient()

    // Extract system message if present
    const systemMessage = messages.find((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const requestParams: MessageCreateParamsNonStreaming = {
      model,
      max_tokens: options?.maxTokens ?? 4096,
      messages: chatMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
    }

    if (systemMessage?.content !== undefined) {
      requestParams.system = systemMessage.content
    }

    if (options?.stopSequences !== undefined) {
      requestParams.stop_sequences = options.stopSequences as string[]
    }

    const response = await client.messages.create(requestParams)

    const textContent = response.content.find((c) => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Anthropic')
    }

    return {
      content: textContent.text,
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason ?? undefined,
    }
  }

  async listModels(): Promise<readonly ModelConfig[]> {
    // Anthropic doesn't have a models list API, return known models
    return [
      { id: 'claude-opus-4-20250514', provider: 'anthropic' as const, priority: 1 },
      { id: 'claude-sonnet-4-20250514', provider: 'anthropic' as const, priority: 2 },
      { id: 'claude-haiku-3-5-20241022', provider: 'anthropic' as const, priority: 3 },
    ]
  }

  async isAvailable(): Promise<boolean> {
    try {
      this.getClient()
      return true
    } catch {
      return false
    }
  }
}
