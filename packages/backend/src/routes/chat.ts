import type { FastifyInstance } from 'fastify'
import { getConversationStore, getConversationOptimizer } from '@wqbot/storage'
import type { OptimizerMessage } from '@wqbot/storage'
import { getModelRouter, convertToAITools } from '@wqbot/models'
import { getToolRegistry, getAgentManager } from '@wqbot/skills'
import { getSSEManager } from '../sse.js'
import type { ApiResponse, ChatRequest, ChatResponse } from '../types.js'

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  const conversationStore = getConversationStore()
  const modelRouter = getModelRouter()
  const sseManager = getSSEManager()
  const optimizer = getConversationOptimizer()

  // 优化消息列表（Token 三阶段优化）
  async function optimizeMessages(
    rawMessages: readonly OptimizerMessage[],
    model?: string
  ): Promise<readonly { role: 'user' | 'assistant' | 'system'; content: string }[]> {
    const modelInfo = modelRouter.getModelInfo(model)
    const result = await optimizer.optimize(rawMessages, modelInfo)

    return result.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))
  }

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
      content: message,
    })

    // 获取对话历史
    const conversation = conversationStore.getConversation(convId)
    if (!conversation) {
      const response: ApiResponse = {
        success: false,
        error: '对话不存在',
      }
      return reply.status(404).send(response)
    }

    // 获取对话历史（带 token 信息，供优化器使用）
    const rawMessages = conversationStore.getMessagesForOptimizer(convId)

    // Token 三阶段优化
    const messages = await optimizeMessages(rawMessages as readonly OptimizerMessage[], model)

    // 创建 SSE 连接
    const connection = sseManager.createConnection(reply)

    // 获取工具列表
    const toolRegistry = getToolRegistry()
    const toolDefs = toolRegistry.getAll()
    const aiTools = toolDefs.length > 0 ? convertToAITools(toolDefs) : undefined

    // 匹配 Agent
    const agentManager = getAgentManager()
    const agent = agentManager.matchAgent(message)

    // 流式响应
    let fullResponse = ''

    try {
      const chatModel = agent?.model || model
      const stream = modelRouter.chatStream(messages, {
        ...(chatModel ? { model: chatModel } : {}),
        ...(agent?.temperature !== undefined ? { temperature: agent.temperature } : {}),
        ...(agent?.prompt ? { systemPrompt: agent.prompt } : {}),
        ...(aiTools ? { tools: aiTools } : {}),
      })

      for await (const chunk of stream) {
        fullResponse += chunk
        sseManager.sendChunk(connection.id, chunk)
      }

      // 保存助手响应
      conversationStore.addMessage(convId, {
        role: 'assistant',
        content: fullResponse,
      })

      // 发送完成信号
      sseManager.sendEvent(connection.id, 'complete', {
        conversationId: convId,
        response: fullResponse,
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
      content: message,
    })

    const conversation = conversationStore.getConversation(convId)
    if (!conversation) {
      const response: ApiResponse = {
        success: false,
        error: '对话不存在',
      }
      return reply.status(404).send(response)
    }

    // 获取对话历史（带 token 信息，供优化器使用）
    const rawMessages = conversationStore.getMessagesForOptimizer(convId)

    // Token 三阶段优化
    const messages = await optimizeMessages(rawMessages as readonly OptimizerMessage[], model)

    try {
      // 获取工具列表
      const toolRegistry = getToolRegistry()
      const toolDefs = toolRegistry.getAll()
      const aiTools = toolDefs.length > 0 ? convertToAITools(toolDefs) : undefined

      // 匹配 Agent
      const agentManager = getAgentManager()
      const agent = agentManager.matchAgent(message)

      const syncModel = agent?.model || model
      const result = await modelRouter.chatSync(messages, {
        ...(syncModel ? { model: syncModel } : {}),
        ...(agent?.temperature !== undefined ? { temperature: agent.temperature } : {}),
        ...(agent?.prompt ? { systemPrompt: agent.prompt } : {}),
        ...(aiTools ? { tools: aiTools } : {}),
      })

      const fullResponse = result.content

      conversationStore.addMessage(convId, {
        role: 'assistant',
        content: fullResponse,
      })

      const response: ApiResponse<ChatResponse> = {
        success: true,
        data: {
          conversationId: convId,
          response: fullResponse,
        },
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
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
        total: conversations.length,
      },
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
        error: '对话不存在',
      }
      return reply.status(404).send(response)
    }

    const response: ApiResponse<typeof conversation> = {
      success: true,
      data: conversation,
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
      data: conversation,
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
        success: true,
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '删除失败',
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

  // 标记消息为重要
  fastify.post<{
    Params: { id: string }
    Body: { messageId: string }
  }>('/api/chat/conversations/:id/pin', async (request, reply) => {
    const { messageId } = request.body
    const conversationId = request.params.id

    try {
      conversationStore.pinMessage(messageId, conversationId)
      const response: ApiResponse = {
        success: true,
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '标记失败',
      }
      return reply.status(500).send(response)
    }
  })

  // 取消标记消息
  fastify.post<{
    Params: { id: string }
    Body: { messageId: string }
  }>('/api/chat/conversations/:id/unpin', async (request, reply) => {
    const { messageId } = request.body
    const conversationId = request.params.id

    try {
      conversationStore.unpinMessage(messageId, conversationId)
      const response: ApiResponse = {
        success: true,
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '取消标记失败',
      }
      return reply.status(500).send(response)
    }
  })

  // 导出对话
  fastify.get<{
    Params: { id: string }
    Querystring: { format?: string }
  }>('/api/chat/conversations/:id/export', async (request, reply) => {
    const conversationId = request.params.id
    const format = (request.query.format as 'json' | 'md') || 'md'

    try {
      const exported = conversationStore.export(conversationId, format)

      if (format === 'json') {
        reply.header('Content-Type', 'application/json')
        reply.header(
          'Content-Disposition',
          `attachment; filename="conversation-${conversationId}.json"`
        )
      } else {
        reply.header('Content-Type', 'text/markdown')
        reply.header(
          'Content-Disposition',
          `attachment; filename="conversation-${conversationId}.md"`
        )
      }

      return reply.send(exported)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '导出失败',
      }
      return reply.status(500).send(response)
    }
  })

  // 手动压缩上下文
  fastify.post<{
    Params: { id: string }
    Body: { force?: boolean }
  }>('/api/chat/conversations/:id/compact', async (request, reply) => {
    const conversationId = request.params.id

    try {
      // 获取所有消息
      const messages = conversationStore.getMessagesForOptimizer(conversationId)

      if (messages.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: '对话中没有消息',
        }
        return reply.status(400).send(response)
      }

      // 使用优化器进行压缩
      const modelInfo = modelRouter.getModelInfo()
      const result = await optimizer.optimize(messages as readonly OptimizerMessage[], modelInfo)

      // 标记被压缩的消息
      const originalIds = new Set(messages.map((m) => m.id))
      const optimizedIds = new Set(result.messages.map((m) => m.id))
      const compactedIds = [...originalIds].filter((id) => !optimizedIds.has(id))

      if (compactedIds.length > 0) {
        conversationStore.markCompacted(compactedIds)
      }

      // 如果有摘要，添加摘要消息
      if (result.summaryText) {
        conversationStore.addSummaryMessage(conversationId, result.summaryText)
      }

      const response: ApiResponse = {
        success: true,
        data: {
          originalCount: messages.length,
          compactedCount: result.messages.length,
          pruned: result.pruned,
          summarized: result.summarized,
          summaryText: result.summaryText,
        },
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '压缩失败',
      }
      return reply.status(500).send(response)
    }
  })
}
