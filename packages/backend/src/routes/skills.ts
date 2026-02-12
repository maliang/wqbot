import type { FastifyInstance } from 'fastify'
import { getSkillRegistry, getSkillMarketplace } from '@wqbot/skills'
import type { ApiResponse } from '../types.js'

export async function skillsRoutes(fastify: FastifyInstance): Promise<void> {
  const skillRegistry = getSkillRegistry()
  const skillMarketplace = getSkillMarketplace()

  // 获取所有已安装技能
  fastify.get('/api/skills', async (_request, reply) => {
    const skills = skillRegistry.getAll()

    const response: ApiResponse<typeof skills> = {
      success: true,
      data: skills,
      meta: {
        total: skills.length
      }
    }
    return reply.send(response)
  })

  // 获取单个技能详情
  fastify.get<{
    Params: { name: string }
  }>('/api/skills/:name', async (request, reply) => {
    const skill = skillRegistry.get(request.params.name)

    if (!skill) {
      const response: ApiResponse = {
        success: false,
        error: '技能不存在'
      }
      return reply.status(404).send(response)
    }

    const response: ApiResponse<typeof skill> = {
      success: true,
      data: skill
    }
    return reply.send(response)
  })

  // 搜索技能市场
  fastify.get<{
    Querystring: { q: string }
  }>('/api/skills/search', async (request, reply) => {
    const query = request.query.q || ''
    const results = await skillMarketplace.search(query)

    const response: ApiResponse<typeof results> = {
      success: true,
      data: results,
      meta: {
        total: results.length
      }
    }
    return reply.send(response)
  })

  // 安装技能
  fastify.post<{
    Body: { uri: string }
  }>('/api/skills/install', async (request, reply) => {
    try {
      await skillMarketplace.install(request.body.uri)

      const response: ApiResponse = {
        success: true
      }
      return reply.status(201).send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '安装失败'
      }
      return reply.status(500).send(response)
    }
  })

  // 卸载技能
  fastify.delete<{
    Params: { name: string }
  }>('/api/skills/:name', async (request, reply) => {
    try {
      await skillMarketplace.uninstall(request.params.name)

      const response: ApiResponse = {
        success: true
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '卸载失败'
      }
      return reply.status(500).send(response)
    }
  })

  // 启用技能
  fastify.post<{
    Params: { name: string }
  }>('/api/skills/:name/enable', async (request, reply) => {
    try {
      skillRegistry.enable(request.params.name)

      const response: ApiResponse = {
        success: true
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '启用失败'
      }
      return reply.status(500).send(response)
    }
  })

  // 禁用技能
  fastify.post<{
    Params: { name: string }
  }>('/api/skills/:name/disable', async (request, reply) => {
    try {
      skillRegistry.disable(request.params.name)

      const response: ApiResponse = {
        success: true
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '禁用失败'
      }
      return reply.status(500).send(response)
    }
  })
}
