import type { FastifyInstance } from 'fastify'
import { getKnowledgeManager } from '@wqbot/knowledge'
import type { ApiResponse } from '../types.js'

export async function knowledgeRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = getKnowledgeManager()

  // 列出集合
  fastify.get('/api/knowledge/collections', async (_request, reply) => {
    try {
      const collections = manager.listCollections()
      return reply.send({ success: true, data: collections } satisfies ApiResponse)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '获取集合列表失败',
      } satisfies ApiResponse)
    }
  })

  // 创建集合
  fastify.post<{
    Body: { name: string; description?: string }
  }>('/api/knowledge/collections', async (request, reply) => {
    try {
      const { name, description } = request.body
      if (!name) {
        return reply.status(400).send({ success: false, error: '缺少 name 参数' } satisfies ApiResponse)
      }
      const collection = manager.createCollection(name, description)
      return reply.send({ success: true, data: collection } satisfies ApiResponse)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '创建集合失败',
      } satisfies ApiResponse)
    }
  })

  // 删除集合
  fastify.delete<{
    Params: { name: string }
  }>('/api/knowledge/collections/:name', async (request, reply) => {
    try {
      const deleted = manager.deleteCollection(request.params.name)
      if (!deleted) {
        return reply.status(404).send({ success: false, error: '集合不存在' } satisfies ApiResponse)
      }
      return reply.send({ success: true } satisfies ApiResponse)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '删除集合失败',
      } satisfies ApiResponse)
    }
  })

  // 添加文档
  fastify.post<{
    Body: { content: string; collection?: string; title?: string; filePath?: string }
  }>('/api/knowledge/documents', async (request, reply) => {
    try {
      const { content, collection, title, filePath } = request.body

      if (filePath) {
        const chunks = await manager.addDocument(filePath, collection ?? 'default')
        return reply.send({ success: true, data: { chunksCreated: chunks } } satisfies ApiResponse)
      }

      if (!content) {
        return reply.status(400).send({ success: false, error: '缺少 content 或 filePath 参数' } satisfies ApiResponse)
      }

      const chunks = await manager.addText(content, collection ?? 'default', title)
      return reply.send({ success: true, data: { chunksCreated: chunks } } satisfies ApiResponse)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '添加文档失败',
      } satisfies ApiResponse)
    }
  })

  // 删除文档
  fastify.delete<{
    Params: { id: string }
  }>('/api/knowledge/documents/:id', async (request, reply) => {
    try {
      const deleted = manager.removeDocument(request.params.id)
      if (!deleted) {
        return reply.status(404).send({ success: false, error: '文档不存在' } satisfies ApiResponse)
      }
      return reply.send({ success: true } satisfies ApiResponse)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '删除文档失败',
      } satisfies ApiResponse)
    }
  })

  // 搜索
  fastify.get<{
    Querystring: { query: string; collection?: string; limit?: string }
  }>('/api/knowledge/search', async (request, reply) => {
    try {
      const { query, collection, limit } = request.query
      if (!query) {
        return reply.status(400).send({ success: false, error: '缺少 query 参数' } satisfies ApiResponse)
      }

      const results = await manager.search(query, collection, limit ? parseInt(limit, 10) : undefined)
      return reply.send({ success: true, data: results } satisfies ApiResponse)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '搜索失败',
      } satisfies ApiResponse)
    }
  })

  // 重新索引
  fastify.post('/api/knowledge/reindex', async (_request, reply) => {
    try {
      await manager.reindex()
      return reply.send({ success: true, data: { message: '重新索引完成' } } satisfies ApiResponse)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '重新索引失败',
      } satisfies ApiResponse)
    }
  })
}
