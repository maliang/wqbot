// API 客户端

const DEFAULT_BASE_URL = 'http://127.0.0.1:3721'

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

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: Message[]
}

export interface ConfigItem {
  name: string
  type: 'rules' | 'skills' | 'agents'
  scope: 'global' | 'project'
  enabled: boolean
  path: string
  content?: string
}

export interface ParallelTask {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
  progress: number
  createdAt: string
  updatedAt: string
  error?: string
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    return response.json() as Promise<ApiResponse<T>>
  }

  // 健康检查
  async health(): Promise<ApiResponse<{ status: string }>> {
    return this.request('/api/health')
  }

  // 聊天 - 流式
  async sendMessageStream(
    message: string,
    conversationId?: string,
    model?: string,
    onChunk?: (chunk: string) => void,
    onComplete?: (response: { conversationId: string; response: string }) => void,
    onError?: (error: string) => void
  ): Promise<AbortController> {
    const controller = new AbortController()

    try {
      const response = await fetch(`${this.baseUrl}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId, model }),
        signal: controller.signal
      })

      const reader = response.body?.getReader()
      if (!reader) {
        onError?.('无法获取响应流')
        return controller
      }

      const decoder = new TextDecoder()
      let buffer = ''

      const processStream = async (): Promise<void> => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line?.startsWith('event: ')) {
              const eventType = line.slice(7)
              const dataLine = lines[i + 1]
              if (dataLine?.startsWith('data: ')) {
                try {
                  const data = JSON.parse(dataLine.slice(6))
                  switch (eventType) {
                    case 'chunk':
                      onChunk?.(data.content)
                      break
                    case 'complete':
                      onComplete?.(data)
                      break
                    case 'error':
                      onError?.(data.message)
                      break
                  }
                } catch {
                  // 忽略解析错误
                }
                i++ // 跳过 data 行
              }
            }
          }
        }
      }

      processStream()
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        onError?.(error instanceof Error ? error.message : '请求失败')
      }
    }

    return controller
  }

  // 对话列表
  async listConversations(limit?: number): Promise<ApiResponse<Conversation[]>> {
    const query = limit ? `?limit=${limit}` : ''
    return this.request(`/api/chat/conversations${query}`)
  }

  // 获取对话
  async getConversation(id: string): Promise<ApiResponse<Conversation>> {
    return this.request(`/api/chat/conversations/${id}`)
  }

  // 创建对话
  async createConversation(title?: string): Promise<ApiResponse<Conversation>> {
    return this.request('/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ title })
    })
  }

  // 删除对话
  async deleteConversation(id: string): Promise<ApiResponse<void>> {
    return this.request(`/api/chat/conversations/${id}`, { method: 'DELETE' })
  }

  // 配置列表
  async listConfigs(): Promise<ApiResponse<ConfigItem[]>> {
    return this.request('/api/config')
  }

  // 切换配置启用状态
  async toggleConfig(
    type: 'rules' | 'skills' | 'agents',
    name: string,
    enabled: boolean,
    scope: 'global' | 'project' = 'project'
  ): Promise<ApiResponse<{ enabled: boolean }>> {
    return this.request(`/api/config/${type}/${name}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled, scope })
    })
  }

  // 任务列表
  async listTasks(): Promise<ApiResponse<ParallelTask[]>> {
    return this.request('/api/tasks')
  }

  // 取消任务
  async cancelTask(id: string): Promise<ApiResponse<ParallelTask>> {
    return this.request(`/api/tasks/${id}/cancel`, { method: 'POST' })
  }

  // 取消所有任务
  async cancelAllTasks(): Promise<ApiResponse<{ cancelled: number }>> {
    return this.request('/api/tasks/cancel-all', { method: 'POST' })
  }

  // 设置
  async getSettings(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request('/api/settings')
  }

  async updateSettings(settings: Record<string, unknown>): Promise<ApiResponse<void>> {
    return this.request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    })
  }
}

export const api = new ApiClient()
export default api
