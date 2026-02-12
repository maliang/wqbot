import OpenAI from 'openai'
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions'
import type { ModelConfig } from '@wqbot/core'
import { BaseProvider, type ChatMessage, type ChatResponse, type ProviderOptions } from './base-provider.js'

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI | null = null

  constructor(options: ProviderOptions = {}) {
    super('openai', options)
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.validateApiKey()
      this.client = new OpenAI({
        apiKey: this.options.apiKey,
        baseURL: this.options.baseUrl,
        timeout: this.options.timeout,
        maxRetries: this.options.maxRetries,
      })
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

    const requestParams: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.7,
    }

    if (options?.maxTokens !== undefined) {
      requestParams.max_tokens = options.maxTokens
    }

    if (options?.stopSequences !== undefined) {
      requestParams.stop = options.stopSequences as string[]
    }

    const response = await client.chat.completions.create(requestParams)

    const choice = response.choices[0]
    if (!choice) {
      throw new Error('No response from OpenAI')
    }

    return {
      content: choice.message.content ?? '',
      model: response.model,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
      finishReason: choice.finish_reason ?? undefined,
    }
  }

  async listModels(): Promise<readonly ModelConfig[]> {
    const client = this.getClient()
    const response = await client.models.list()

    const gptModels = response.data.filter(
      (m) => m.id.startsWith('gpt-') || m.id.startsWith('o1')
    )

    return gptModels.map((m, index) => ({
      id: m.id,
      provider: 'openai' as const,
      priority: index + 1,
    }))
  }

  async isAvailable(): Promise<boolean> {
    try {
      const client = this.getClient()
      await client.models.list()
      return true
    } catch {
      return false
    }
  }
}
