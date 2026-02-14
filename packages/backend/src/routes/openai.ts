import type { FastifyInstance } from 'fastify'
import { getModelRouter } from '@wqbot/models'
import { createModuleLogger, getConfigManager } from '@wqbot/core'
import type { ModelProvider } from '@wqbot/core'

const logger = createModuleLogger('openai-compat')

// Provider 对应的模型列表
const PROVIDER_MODELS: Record<string, readonly string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o3', 'o3-mini'],
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-opus-4-20250514',
  ],
  google: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  deepseek: ['deepseek-chat'],
  groq: ['llama3-70b-8192', 'mixtral-8x7b-32768'],
  ollama: ['llama3', 'llama3:8b', 'qwen2:7b', 'codellama', 'mistral'],
}

function generateId(): string {
  return 'chatcmpl-' + Math.random().toString(36).slice(2, 14)
}

interface OpenAIError {
  readonly error: {
    readonly message: string
    readonly type: string
    readonly code: string
  }
}

function errorResponse(message: string, type: string, code: string): OpenAIError {
  return { error: { message, type, code } }
}

interface CompletionRequest {
  readonly model: string
  readonly messages: readonly { role: string; content: string }[]
  readonly stream?: boolean
  readonly temperature?: number
  readonly max_tokens?: number
  readonly top_p?: number
}

export async function openaiRoutes(fastify: FastifyInstance): Promise<void> {
  const modelRouter = getModelRouter()

  // GET /v1/models — 返回可用模型列表
  fastify.get('/v1/models', async () => {
    const providers = modelRouter.getAvailableProviders()
    const config = getConfigManager()

    // 标准 provider 模型
    const models: { id: string; object: 'model'; created: number; owned_by: string }[] = providers
      .filter((p) => p !== 'custom')
      .flatMap((provider: ModelProvider) => {
        const modelIds = PROVIDER_MODELS[provider] ?? []
        return modelIds.map((id) => ({
          id,
          object: 'model' as const,
          created: 0,
          owned_by: provider as string,
        }))
      })

    // custom 端点模型
    for (const name of config.getCustomEndpointNames()) {
      const endpoint = config.getCustomEndpoint(name)
      for (const entry of endpoint?.models ?? []) {
        const id = typeof entry === 'string' ? entry : entry.id
        models.push({
          id: `${name}/${id}`,
          object: 'model' as const,
          created: 0,
          owned_by: `custom:${name}`,
        })
      }
    }

    return { object: 'list', data: models }
  })

  // POST /v1/chat/completions — OpenAI 兼容对话接口
  fastify.post<{ Body: CompletionRequest }>('/v1/chat/completions', async (request, reply) => {
    const { model, messages, stream, temperature, max_tokens } = request.body

    if (!model) {
      return reply
        .status(400)
        .send(errorResponse('model is required', 'invalid_request_error', 'missing_model'))
    }

    if (!messages || messages.length === 0) {
      return reply
        .status(400)
        .send(
          errorResponse(
            'messages is required and must not be empty',
            'invalid_request_error',
            'missing_messages'
          )
        )
    }

    const chatMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))

    const chatOptions = {
      model,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(max_tokens !== undefined ? { maxTokens: max_tokens } : {}),
    }

    // 流式响应
    if (stream) {
      const id = generateId()
      const created = Math.floor(Date.now() / 1000)

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const sendChunk = (data: unknown) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      try {
        // 首个 chunk：发送 role
        sendChunk({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        })

        const streamGen = modelRouter.chatStream(chatMessages, chatOptions)

        for await (const text of streamGen) {
          sendChunk({
            id,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
          })
        }

        // 结束 chunk
        sendChunk({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })

        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        logger.error('流式响应错误:', error instanceof Error ? error : new Error(String(error)))

        // 尝试发送错误（连接可能已断开）
        try {
          sendChunk({ error: { message, type: 'server_error', code: 'internal_error' } })
          reply.raw.end()
        } catch {
          // 连接已关闭，忽略
        }
      }

      return reply
    }

    // 非流式响应
    try {
      const result = await modelRouter.chatSync(chatMessages, chatOptions)

      return reply.send({
        id: generateId(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: result.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: result.content },
            finish_reason: 'stop',
          },
        ],
        usage: result.usage
          ? {
              prompt_tokens: result.usage.promptTokens,
              completion_tokens: result.usage.completionTokens,
              total_tokens: result.usage.totalTokens,
            }
          : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      logger.error('对话请求错误:', error instanceof Error ? error : new Error(String(error)))
      return reply.status(500).send(errorResponse(message, 'server_error', 'internal_error'))
    }
  })
}
