import type { FastifyReply } from 'fastify'
import type { ConfigType } from '@wqbot/core'

// SSE 连接管理
export interface SSEConnection {
  readonly id: string
  readonly reply: FastifyReply
  readonly createdAt: Date
}

// API 响应格式
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total?: number
    page?: number
    limit?: number
  }
}

// 聊天请求
export interface ChatRequest {
  message: string
  conversationId?: string
  model?: string
}

// 聊天响应
export interface ChatResponse {
  conversationId: string
  response: string
}

// 配置类型（从 core 统一导出，避免重复定义）
export type { ConfigType, ConfigItem } from '@wqbot/core'

// 配置生成请求
export interface ConfigGenerateRequest {
  type: ConfigType
  description: string
  scope: 'global' | 'project'
}

// 并行任务
export interface ParallelTask {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
  progress: number
  createdAt: Date
  updatedAt: Date
  error?: string
}

// 快照信息（从 @wqbot/core 重导出以便路由使用）
export type { SnapshotInfo } from '@wqbot/core'

// 设置
export interface Settings {
  language: string
  model: string
  maxTokens: number
  windowSize: number
  summaryThreshold: number
  importanceDecay: number
}
