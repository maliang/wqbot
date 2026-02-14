import type { FastifyInstance } from 'fastify'
import { getSnapshotManager } from '@wqbot/core'
import type { ApiResponse, SnapshotInfo } from '../types.js'

export async function snapshotRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = getSnapshotManager()

  // 创建快照
  fastify.post<{
    Body: { dir: string; message?: string }
  }>('/api/snapshot/track', async (request, reply) => {
    try {
      const { dir, message } = request.body
      if (!dir) {
        return reply.status(400).send({ success: false, error: '缺少 dir 参数' } satisfies ApiResponse)
      }
      const info = await manager.track(dir, message)
      return reply.send({ success: true, data: info } satisfies ApiResponse<SnapshotInfo>)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '创建快照失败',
      } satisfies ApiResponse)
    }
  })

  // 列出快照
  fastify.get<{
    Querystring: { dir: string; limit?: string }
  }>('/api/snapshot/list', async (request, reply) => {
    try {
      const { dir, limit } = request.query
      if (!dir) {
        return reply.status(400).send({ success: false, error: '缺少 dir 参数' } satisfies ApiResponse)
      }
      const snapshots = await manager.list(dir, limit ? parseInt(limit, 10) : undefined)
      return reply.send({ success: true, data: snapshots } satisfies ApiResponse<readonly SnapshotInfo[]>)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '获取快照列表失败',
      } satisfies ApiResponse)
    }
  })

  // 恢复快照
  fastify.post<{
    Body: { dir: string; hash: string }
  }>('/api/snapshot/revert', async (request, reply) => {
    try {
      const { dir, hash } = request.body
      if (!dir || !hash) {
        return reply.status(400).send({ success: false, error: '缺少 dir 或 hash 参数' } satisfies ApiResponse)
      }
      await manager.revert(dir, hash)
      return reply.send({ success: true } satisfies ApiResponse)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '恢复快照失败',
      } satisfies ApiResponse)
    }
  })

  // 恢复单个文件
  fastify.post<{
    Body: { dir: string; hash: string; filePath: string }
  }>('/api/snapshot/restore-file', async (request, reply) => {
    try {
      const { dir, hash, filePath } = request.body
      if (!dir || !hash || !filePath) {
        return reply.status(400).send({ success: false, error: '缺少必要参数' } satisfies ApiResponse)
      }
      await manager.restoreFile(dir, hash, filePath)
      return reply.send({ success: true } satisfies ApiResponse)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '恢复文件失败',
      } satisfies ApiResponse)
    }
  })

  // 清理旧快照
  fastify.delete<{
    Querystring: { dir: string; maxAgeHours?: string }
  }>('/api/snapshot/cleanup', async (request, reply) => {
    try {
      const { dir, maxAgeHours } = request.query
      if (!dir) {
        return reply.status(400).send({ success: false, error: '缺少 dir 参数' } satisfies ApiResponse)
      }
      const removed = await manager.cleanup(dir, maxAgeHours ? parseInt(maxAgeHours, 10) : undefined)
      return reply.send({ success: true, data: { removed } } satisfies ApiResponse<{ removed: number }>)
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : '清理快照失败',
      } satisfies ApiResponse)
    }
  })
}
