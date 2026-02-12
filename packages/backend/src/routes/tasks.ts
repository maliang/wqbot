import type { FastifyInstance } from 'fastify'
import { generateId } from '@wqbot/core'
import { getSSEManager } from '../sse.js'
import type { ApiResponse, ParallelTask } from '../types.js'

// 任务存储（内存中）
const tasks: Map<string, ParallelTask> = new Map()

export async function tasksRoutes(fastify: FastifyInstance): Promise<void> {
  const sseManager = getSSEManager()

  // 获取所有任务
  fastify.get('/api/tasks', async (_request, reply) => {
    const allTasks = Array.from(tasks.values())

    const response: ApiResponse<ParallelTask[]> = {
      success: true,
      data: allTasks,
      meta: {
        total: allTasks.length
      }
    }
    return reply.send(response)
  })

  // 获取单个任务
  fastify.get<{
    Params: { id: string }
  }>('/api/tasks/:id', async (request, reply) => {
    const task = tasks.get(request.params.id)

    if (!task) {
      const response: ApiResponse = {
        success: false,
        error: '任务不存在'
      }
      return reply.status(404).send(response)
    }

    const response: ApiResponse<ParallelTask> = {
      success: true,
      data: task
    }
    return reply.send(response)
  })

  // 创建任务
  fastify.post<{
    Body: { name: string }
  }>('/api/tasks', async (request, reply) => {
    const task: ParallelTask = {
      id: generateId(),
      name: request.body.name,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    tasks.set(task.id, task)

    // 广播任务创建事件
    sseManager.broadcast('task-created', task)

    const response: ApiResponse<ParallelTask> = {
      success: true,
      data: task
    }
    return reply.status(201).send(response)
  })

  // 更新任务进度
  fastify.put<{
    Params: { id: string }
    Body: { progress?: number; status?: ParallelTask['status']; error?: string }
  }>('/api/tasks/:id', async (request, reply) => {
    const task = tasks.get(request.params.id)

    if (!task) {
      const response: ApiResponse = {
        success: false,
        error: '任务不存在'
      }
      return reply.status(404).send(response)
    }

    const { progress, status, error } = request.body

    // 不可变更新
    const updatedTask: ParallelTask = {
      ...task,
      progress: progress ?? task.progress,
      status: status ?? task.status,
      error: error ?? task.error,
      updatedAt: new Date()
    }

    tasks.set(task.id, updatedTask)

    // 广播任务更新事件
    sseManager.broadcast('task-updated', updatedTask)

    const response: ApiResponse<ParallelTask> = {
      success: true,
      data: updatedTask
    }
    return reply.send(response)
  })

  // 取消任务
  fastify.post<{
    Params: { id: string }
  }>('/api/tasks/:id/cancel', async (request, reply) => {
    const task = tasks.get(request.params.id)

    if (!task) {
      const response: ApiResponse = {
        success: false,
        error: '任务不存在'
      }
      return reply.status(404).send(response)
    }

    if (task.status === 'completed' || task.status === 'cancelled') {
      const response: ApiResponse = {
        success: false,
        error: '任务已完成或已取消'
      }
      return reply.status(400).send(response)
    }

    const updatedTask: ParallelTask = {
      ...task,
      status: 'cancelled',
      updatedAt: new Date()
    }

    tasks.set(task.id, updatedTask)

    // 广播任务取消事件
    sseManager.broadcast('task-cancelled', updatedTask)

    const response: ApiResponse<ParallelTask> = {
      success: true,
      data: updatedTask
    }
    return reply.send(response)
  })

  // 取消所有任务
  fastify.post('/api/tasks/cancel-all', async (_request, reply) => {
    const cancelledTasks: ParallelTask[] = []

    for (const [id, task] of tasks) {
      if (task.status === 'pending' || task.status === 'running') {
        const updatedTask: ParallelTask = {
          ...task,
          status: 'cancelled',
          updatedAt: new Date()
        }
        tasks.set(id, updatedTask)
        cancelledTasks.push(updatedTask)
      }
    }

    // 广播批量取消事件
    sseManager.broadcast('tasks-cancelled', { tasks: cancelledTasks })

    const response: ApiResponse<{ cancelled: number }> = {
      success: true,
      data: { cancelled: cancelledTasks.length }
    }
    return reply.send(response)
  })

  // 删除已完成的任务
  fastify.delete('/api/tasks/completed', async (_request, reply) => {
    let deletedCount = 0

    for (const [id, task] of tasks) {
      if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'failed') {
        tasks.delete(id)
        deletedCount++
      }
    }

    const response: ApiResponse<{ deleted: number }> = {
      success: true,
      data: { deleted: deletedCount }
    }
    return reply.send(response)
  })
}
