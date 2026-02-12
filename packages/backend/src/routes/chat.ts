import type { FastifyInstance } from 'fastify'
import { getConversationStore } from '@wqbot/storage'
import { getModelRouter } from '@wqbot/models'
import { getSSEManager } from '../sse.js'
import type { ApiResponse, ChatRequest, ChatResponse } from '../types.js'

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  const conversationStore = getConversationStore()
  const modelRouter = getModelRouter()
  const sseManager = getSSEManager()

  // 发送消息（SSE 流式响应）
  fastify.post<{
    Body: ChatRequest
  }>('/api/chat/send', async (request, reply) => {
    const { message, conversationId, model } = request.body

    let convId = conversationId

    // 创建或获取对话
    if (!convId) {
      const conv = conversationStore.createConversation()
      convId = conv.id
    }

    // 添加用户消息
    conversationStore.addMessage(convId, {
      role: 'user',
      content: message
    })

    // 获取对话历史
    const conversation = conversationStore.getConversation(convId)
    if (!conversation) {
      const response: ApiResponse = {
        success: false,
        error: '对话不存在'
      }
      return reply.status(404).send(response)
    }

    const messages = conversation.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    // 创建 SSE 连接
    const connection = sseManager.createConnection(reply)

    // 流式响应
    let fullResponse = ''

    try {
      const stream = await modelRouter.chat(messages, {
        stream: true,
        model
      })

      for await (const chunk of stream) {
        fullResponse += chunk
        sseManager.sendChunk(connection.id, chunk)
      }

      // 保存助手响应
      conversationStore.addMessage(convId, {
        role: 'assistant',
        content: fullResponse
      })

      // 发送完成信号
      sseManager.sendEvent(connection.id, 'complete', {
        conversationId: convId,
        response: fullResponse
      })
      sseManager.sendStreamEnd(connection.id)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      sseManager.sendError(connection.id, errorMessage)
    } finally {
      sseManager.closeConnection(connection.id)
    }
  })

  // 非流式发送消息
  fastify.post<{
    Body: ChatRequest
  }>('/api/chat/send-sync', async (request, reply) => {
    const { message, conversationId, model } = request.body

    let convId = conversationId

    if (!convId) {
      const conv = conversationStore.createConversation()
      convId = conv.id
    }

    conversationStore.addMessage(convId, {
      role: 'user',
      content: message
    })

    const conversation = conversationStore.getConversation(convId)
    if (!conversation) {
      const response: ApiResponse = {
        success: false,
        error: '对话不存在'
      }
      return reply.status(404).send(response)
    }

    const messages = conversation.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    try {
      const result = await modelRouter.chat(messages, {
        stream: false,
        model
      })

      const fullResponse = typeof result === 'string' ? result : ''

      conversationStore.addMessage(convId, {
        role: 'assistant',
        content: fullResponse
      })

      const response: ApiResponse<ChatResponse> = {
        success: true,
        data: {
          conversationId: convId,
          response: fullResponse
        }
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      }
      return reply.status(500).send(response)
    }
  })

  // 获取对话列表
  fastify.get<{
    Querystring: { limit?: string }
  }>('/api/chat/conversations', async (request, reply) => {
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : undefined
    const conversations = conversationStore.listConversations(limit)

    const response: ApiResponse<typeof conversations> = {
      success: true,
      data: conversations,
      meta: {
        total: conversations.length
      }
    }
    return reply.send(response)
  })

  // 获取单个对话
  fastify.get<{
    Params: { id: string }
  }>('/api/chat/conversations/:id', async (request, reply) => {
    const conversation = conversationStore.getConversation(request.params.id)

    if (!conversation) {
      const response: ApiResponse = {
        success: false,
        error: '对话不存在'
      }
      return reply.status(404).send(response)
    }

    const response: ApiResponse<typeof conversation> = {
      success: true,
      data: conversation
    }
    return reply.send(response)
  })

  // 创建新对话
  fastify.post<{
    Body: { title?: string }
  }>('/api/chat/conversations', async (request, reply) => {
    const conversation = conversationStore.createConversation(request.body.title)

    const response: ApiResponse<typeof conversation> = {
      success: true,
      data: conversation
    }
    return reply.status(201).send(response)
  })

  // 删除对话
  fastify.delete<{
    Params: { id: string }
  }>('/api/chat/conversations/:id', async (request, reply) => {
    try {
      conversationStore.deleteConversation(request.params.id)
      const response: ApiResponse = {
        success: true
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '删除失败'
      }
      return reply.status(500).send(response)
    }
  })

  // SSE 事件流端点
  fastify.get('/api/chat/events', async (request, reply) => {
    const connection = sseManager.createConnection(reply)

    // 发送连接成功事件
    sseManager.sendEvent(connection.id, 'connected', { connectionId: connection.id })

    // 保持连接打开，等待客户端关闭
    request.raw.on('close', () => {
      sseManager.closeConnection(connection.id)
    })
  })
}
