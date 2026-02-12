import { create } from 'zustand'
import api, { type Conversation, type Message, type ConfigItem, type ParallelTask } from '../api'

interface ChatState {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  isLoading: boolean
  streamingContent: string
  error: string | null

  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  createConversation: (title?: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  clearError: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  streamingContent: '',
  error: null,

  loadConversations: async () => {
    const result = await api.listConversations(50)
    if (result.success && result.data) {
      set({ conversations: result.data })
    }
  },

  selectConversation: async (id: string) => {
    set({ currentConversationId: id, isLoading: true })
    const result = await api.getConversation(id)
    if (result.success && result.data) {
      set({ messages: result.data.messages || [], isLoading: false })
    } else {
      set({ isLoading: false, error: result.error ?? null })
    }
  },

  createConversation: async (title?: string) => {
    const result = await api.createConversation(title)
    if (result.success && result.data) {
      set((state) => ({
        conversations: [result.data!, ...state.conversations],
        currentConversationId: result.data!.id,
        messages: []
      }))
    }
  },

  deleteConversation: async (id: string) => {
    const result = await api.deleteConversation(id)
    if (result.success) {
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        currentConversationId:
          state.currentConversationId === id ? null : state.currentConversationId,
        messages: state.currentConversationId === id ? [] : state.messages
      }))
    }
  },

  sendMessage: async (content: string) => {
    const { currentConversationId } = get()

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      streamingContent: ''
    }))

    await api.sendMessageStream(
      content,
      currentConversationId || undefined,
      undefined,
      (chunk) => {
        set((state) => ({
          streamingContent: state.streamingContent + chunk
        }))
      },
      (response) => {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: response.response,
          timestamp: new Date().toISOString()
        }

        set((state) => ({
          messages: [...state.messages, assistantMessage],
          currentConversationId: response.conversationId,
          isLoading: false,
          streamingContent: ''
        }))

        // 刷新对话列表
        get().loadConversations()
      },
      (error) => {
        set({ isLoading: false, streamingContent: '', error })
      }
    )
  },

  clearError: () => set({ error: null })
}))

interface ConfigState {
  configs: ConfigItem[]
  isLoading: boolean

  loadConfigs: () => Promise<void>
  toggleConfig: (type: ConfigItem['type'], name: string, enabled: boolean, scope: ConfigItem['scope']) => Promise<void>
}

export const useConfigStore = create<ConfigState>((set) => ({
  configs: [],
  isLoading: false,

  loadConfigs: async () => {
    set({ isLoading: true })
    const result = await api.listConfigs()
    if (result.success && result.data) {
      set({ configs: result.data, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },

  toggleConfig: async (type, name, enabled, scope) => {
    const result = await api.toggleConfig(type, name, enabled, scope)
    if (result.success) {
      set((state) => ({
        configs: state.configs.map((c) =>
          c.type === type && c.name === name && c.scope === scope
            ? { ...c, enabled }
            : c
        )
      }))
    }
  }
}))

interface TaskState {
  tasks: ParallelTask[]
  isLoading: boolean

  loadTasks: () => Promise<void>
  cancelTask: (id: string) => Promise<void>
  cancelAllTasks: () => Promise<void>
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoading: false,

  loadTasks: async () => {
    const result = await api.listTasks()
    if (result.success && result.data) {
      set({ tasks: result.data })
    }
  },

  cancelTask: async (id: string) => {
    const result = await api.cancelTask(id)
    if (result.success) {
      get().loadTasks()
    }
  },

  cancelAllTasks: async () => {
    const result = await api.cancelAllTasks()
    if (result.success) {
      get().loadTasks()
    }
  }
}))
