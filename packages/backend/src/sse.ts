import type { FastifyReply } from 'fastify'
import { generateId } from '@wqbot/core'
import type { SSEConnection } from './types.js'

// SSE 连接管理器
class SSEManager {
  private connections: Map<string, SSEConnection> = new Map()

  // 创建新的 SSE 连接
  createConnection(reply: FastifyReply): SSEConnection {
    const connection: SSEConnection = {
      id: generateId(),
      reply,
      createdAt: new Date()
    }

    // 设置 SSE 响应头
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    this.connections.set(connection.id, connection)

    // 连接关闭时清理
    reply.raw.on('close', () => {
      this.removeConnection(connection.id)
    })

    return connection
  }

  // 移除连接
  removeConnection(id: string): void {
    this.connections.delete(id)
  }

  // 向指定连接发送事件
  sendEvent(connectionId: string, event: string, data: unknown): boolean {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      return false
    }

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    connection.reply.raw.write(payload)
    return true
  }

  // 向所有连接广播事件
  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const connection of this.connections.values()) {
      connection.reply.raw.write(payload)
    }
  }

  // 发送流式数据块
  sendChunk(connectionId: string, chunk: string): boolean {
    return this.sendEvent(connectionId, 'chunk', { content: chunk })
  }

  // 发送流结束信号
  sendStreamEnd(connectionId: string): boolean {
    return this.sendEvent(connectionId, 'stream-end', {})
  }

  // 发送错误
  sendError(connectionId: string, error: string): boolean {
    return this.sendEvent(connectionId, 'error', { message: error })
  }

  // 发送任务进度更新
  sendTaskProgress(connectionId: string, taskId: string, progress: number, status: string): boolean {
    return this.sendEvent(connectionId, 'task-progress', { taskId, progress, status })
  }

  // 发送配置变更通知
  sendConfigChange(type: string, name: string, action: 'created' | 'updated' | 'deleted'): void {
    this.broadcast('config-change', { type, name, action })
  }

  // 获取连接数量
  getConnectionCount(): number {
    return this.connections.size
  }

  // 关闭指定连接
  closeConnection(id: string): void {
    const connection = this.connections.get(id)
    if (connection) {
      connection.reply.raw.end()
      this.removeConnection(id)
    }
  }

  // 关闭所有连接
  closeAll(): void {
    for (const connection of this.connections.values()) {
      connection.reply.raw.end()
    }
    this.connections.clear()
  }
}

// 单例实例
let sseManager: SSEManager | null = null

export function getSSEManager(): SSEManager {
  if (!sseManager) {
    sseManager = new SSEManager()
  }
  return sseManager
}

export function initializeSSE(): SSEManager {
  sseManager = new SSEManager()
  return sseManager
}
