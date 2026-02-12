import type { ModelConfig } from '@wqbot/core'
import { BaseProvider, type ChatMessage, type ChatResponse, type ProviderOptions } from './base-provider.js'

interface OllamaGenerateResponse {
  model: string
  response: string
  done: boolean
  context?: number[]
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

interface OllamaModel {
  name: string
  modified_at: string
  size: number
}

interface OllamaListResponse {
  models: OllamaModel[]
}

export class OllamaProvider extends BaseProvider {
  private readonly baseUrl: string

  constructor(options: ProviderOptions = {}) {
    super('ollama', options)
    this.baseUrl = options.baseUrl ?? 'http://localhost:11434'
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
    // Build prompt from messages
    const prompt = this.buildPrompt(messages)

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens,
          stop: options?.stopSequences,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`)
    }

    const data = (await response.json()) as OllamaGenerateResponse

    return {
      content: data.response,
      model: data.model,
      usage: data.prompt_eval_count !== undefined && data.eval_count !== undefined
        ? {
            promptTokens: data.prompt_eval_count,
            completionTokens: data.eval_count,
            totalTokens: data.prompt_eval_count + data.eval_count,
          }
        : undefined,
      finishReason: data.done ? 'stop' : undefined,
    }
  }

  private buildPrompt(messages: readonly ChatMessage[]): string {
    return messages
      .map((m) => {
        switch (m.role) {
          case 'system':
            return `System: ${m.content}`
          case 'user':
            return `User: ${m.content}`
          case 'assistant':
            return `Assistant: ${m.content}`
        }
      })
      .join('\n\n') + '\n\nAssistant:'
  }

  async listModels(): Promise<readonly ModelConfig[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`)

    if (!response.ok) {
      throw new Error(`Failed to list Ollama models: ${response.statusText}`)
    }

    const data = (await response.json()) as OllamaListResponse

    return data.models.map((m, index) => ({
      id: m.name,
      provider: 'ollama' as const,
      priority: index + 1,
    }))
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }
}
