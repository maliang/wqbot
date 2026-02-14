// 后端 API 客户端

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

export interface ChatResponse {
  conversationId: string
  response: string
}

export type { ConfigItem } from '@wqbot/core'

export interface ParallelTask {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed'
  progress: number
  createdAt: string
  updatedAt: string
  error?: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount?: number
}

export interface SSEEvent {
  event: string
  data: unknown
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    return response.json() as Promise<ApiResponse<T>>
  }

  // 健康检查
  async health(): Promise<ApiResponse<{ status: string; timestamp: string; connections: number }>> {
    return this.request('/api/health')
  }

  // 聊天 API
  async sendMessage(
    message: string,
    conversationId?: string,
    model?: string
  ): Promise<ApiResponse<ChatResponse>> {
    return this.request('/api/chat/send-sync', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId, model }),
    })
  }

  // 流式聊天（返回 AbortController）
  createChatStream(
    message: string,
    conversationId?: string,
    model?: string,
    onChunk?: (chunk: string) => void,
    onComplete?: (response: ChatResponse) => void,
    onError?: (error: string) => void
  ): AbortController {
    const controller = new AbortController()

    const sendRequest = async (): Promise<void> => {
      try {
        const response = await fetch(`${this.baseUrl}/api/chat/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, conversationId, model }),
          signal: controller.signal,
        })

        const reader = response.body?.getReader()
        if (!reader) {
          onError?.('无法获取响应流')
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6))
                switch (currentEvent) {
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
                // 忽略无效 JSON
              }
              currentEvent = ''
            } else if (line.trim() === '') {
              currentEvent = ''
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          onError?.(error instanceof Error ? error.message : '请求失败')
        }
      }
    }

    sendRequest()
    return controller
  }

  // 流式聊天（Promise 风格，与内嵌 API 签名一致）
  async sendMessageStream(
    message: string,
    conversationId?: string,
    model?: string,
    onChunk?: (chunk: string) => void,
    onComplete?: (response: ChatResponse) => void,
    onError?: (error: string) => void
  ): Promise<{ abort: () => void }> {
    const controller = this.createChatStream(
      message,
      conversationId,
      model,
      onChunk,
      onComplete,
      onError
    )
    return { abort: () => controller.abort() }
  }

  async listConversations(limit?: number): Promise<ApiResponse<Conversation[]>> {
    const query = limit ? `?limit=${limit}` : ''
    return this.request(`/api/chat/conversations${query}`)
  }

  async getConversation(id: string): Promise<ApiResponse<Conversation>> {
    return this.request(`/api/chat/conversations/${id}`)
  }

  async createConversation(title?: string): Promise<ApiResponse<Conversation>> {
    return this.request('/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  }

  async deleteConversation(id: string): Promise<ApiResponse<void>> {
    return this.request(`/api/chat/conversations/${id}`, {
      method: 'DELETE',
    })
  }

  // 配置 API
  async listConfigs(): Promise<ApiResponse<ConfigItem[]>> {
    return this.request('/api/config')
  }

  async getConfigsByType(
    type: 'rules' | 'skills' | 'agents',
    scope?: 'global' | 'project'
  ): Promise<ApiResponse<ConfigItem[]>> {
    const query = scope ? `?scope=${scope}` : ''
    return this.request(`/api/config/${type}${query}`)
  }

  async getConfig(
    type: 'rules' | 'skills' | 'agents',
    name: string,
    scope?: 'global' | 'project'
  ): Promise<ApiResponse<ConfigItem>> {
    const query = scope ? `?scope=${scope}` : ''
    return this.request(`/api/config/${type}/${name}${query}`)
  }

  async updateConfig(
    type: 'rules' | 'skills' | 'agents',
    name: string,
    content: string,
    scope: 'global' | 'project' = 'project'
  ): Promise<ApiResponse<{ path: string }>> {
    return this.request(`/api/config/${type}/${name}`, {
      method: 'PUT',
      body: JSON.stringify({ content, scope }),
    })
  }

  async deleteConfig(
    type: 'rules' | 'skills' | 'agents',
    name: string,
    scope?: 'global' | 'project'
  ): Promise<ApiResponse<void>> {
    const query = scope ? `?scope=${scope}` : ''
    return this.request(`/api/config/${type}/${name}${query}`, {
      method: 'DELETE',
    })
  }

  async toggleConfig(
    type: 'rules' | 'skills' | 'agents',
    name: string,
    enabled: boolean,
    scope: 'global' | 'project' = 'project'
  ): Promise<ApiResponse<{ enabled: boolean }>> {
    return this.request(`/api/config/${type}/${name}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled, scope }),
    })
  }

  async generateConfig(
    type: 'rules' | 'skills' | 'agents',
    description: string,
    scope: 'global' | 'project' = 'project'
  ): Promise<ApiResponse<{ content: string; type: string; scope: string }>> {
    return this.request('/api/config/generate', {
      method: 'POST',
      body: JSON.stringify({ type, description, scope }),
    })
  }

  // 技能 API
  async listSkills(): Promise<ApiResponse<unknown[]>> {
    return this.request('/api/skills')
  }

  async getSkill(name: string): Promise<ApiResponse<unknown>> {
    return this.request(`/api/skills/${name}`)
  }

  async searchSkills(query: string): Promise<ApiResponse<unknown[]>> {
    return this.request(`/api/skills/search?q=${encodeURIComponent(query)}`)
  }

  async installSkill(uri: string): Promise<ApiResponse<void>> {
    return this.request('/api/skills/install', {
      method: 'POST',
      body: JSON.stringify({ uri }),
    })
  }

  async uninstallSkill(name: string): Promise<ApiResponse<void>> {
    return this.request(`/api/skills/${name}`, {
      method: 'DELETE',
    })
  }

  async enableSkill(name: string): Promise<ApiResponse<void>> {
    return this.request(`/api/skills/${name}/enable`, {
      method: 'POST',
    })
  }

  async disableSkill(name: string): Promise<ApiResponse<void>> {
    return this.request(`/api/skills/${name}/disable`, {
      method: 'POST',
    })
  }

  // 任务 API
  async listTasks(): Promise<ApiResponse<ParallelTask[]>> {
    return this.request('/api/tasks')
  }

  async getTask(id: string): Promise<ApiResponse<ParallelTask>> {
    return this.request(`/api/tasks/${id}`)
  }

  async createTask(name: string): Promise<ApiResponse<ParallelTask>> {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  }

  async cancelTask(id: string): Promise<ApiResponse<ParallelTask>> {
    return this.request(`/api/tasks/${id}/cancel`, {
      method: 'POST',
    })
  }

  async cancelAllTasks(): Promise<ApiResponse<{ cancelled: number }>> {
    return this.request('/api/tasks/cancel-all', {
      method: 'POST',
    })
  }

  // 设置 API
  async getSettings(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request('/api/settings')
  }

  async updateSettings(settings: Record<string, unknown>): Promise<ApiResponse<void>> {
    return this.request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }

  async getSetting(key: string): Promise<ApiResponse<{ key: string; value: unknown }>> {
    return this.request(`/api/settings/${key}`)
  }

  async setSetting(key: string, value: unknown): Promise<ApiResponse<void>> {
    return this.request(`/api/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    })
  }

  async getLanguage(): Promise<ApiResponse<{ language: string }>> {
    return this.request('/api/settings/language')
  }

  async setLanguage(language: string): Promise<ApiResponse<void>> {
    return this.request('/api/settings/language', {
      method: 'PUT',
      body: JSON.stringify({ language }),
    })
  }

  // 对话操作 API
  async pinMessage(conversationId: string, messageId: string): Promise<ApiResponse<void>> {
    return this.request(`/api/chat/conversations/${conversationId}/pin`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    })
  }

  async unpinMessage(conversationId: string, messageId: string): Promise<ApiResponse<void>> {
    return this.request(`/api/chat/conversations/${conversationId}/unpin`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    })
  }

  async compactConversation(
    conversationId: string,
    force?: boolean
  ): Promise<
    ApiResponse<{
      originalCount: number
      compactedCount: number
      pruned: number
      summarized: boolean
      summaryText?: string
    }>
  > {
    return this.request(`/api/chat/conversations/${conversationId}/compact`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    })
  }

  async exportConversation(conversationId: string, format: 'json' | 'md' = 'md'): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/api/chat/conversations/${conversationId}/export?format=${format}`
    )
    if (!response.ok) {
      throw new Error(`导出失败: ${response.statusText}`)
    }
    return response.text()
  }
}

// 单例实例
let apiClient: ApiClient | null = null

export function getApiClient(): ApiClient {
  if (!apiClient) {
    apiClient = new ApiClient()
  }
  return apiClient
}

export function initializeApiClient(baseUrl?: string): ApiClient {
  apiClient = new ApiClient(baseUrl)
  return apiClient
}

export { ApiClient }
