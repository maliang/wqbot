import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { Welcome } from './Welcome.js'
import { StatusBar } from './StatusBar.js'
import { TaskPanel } from './TaskPanel.js'
import { Message, StreamingMessage } from './Message.js'
import { InputBox } from './Input.js'
import { LoadingSpinner } from './Spinner.js'
import { executeCommand } from '../commands/index.js'
import { getApiClient, type ConfigItem, type ParallelTask } from '../api.js'

const VERSION = '0.1.0'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

interface AppProps {
  initialMessage?: string
  model?: string
  conversationId?: string
  singleMode?: boolean
}

export const App: React.FC<AppProps> = ({
  initialMessage,
  model: initialModel,
  conversationId: initialConversationId,
  singleMode = false,
}) => {
  const { exit } = useApp()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [configs, setConfigs] = useState<ConfigItem[]>([])
  const [tasks, setTasks] = useState<ParallelTask[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [model] = useState(initialModel)
  const [conversationId, setConversationId] = useState(initialConversationId)
  const [systemMessage, setSystemMessage] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(!initialMessage)

  // 加载配置
  useEffect(() => {
    const loadConfigs = async (): Promise<void> => {
      try {
        const api = getApiClient()
        const result = await api.listConfigs()
        if (result.success && result.data) {
          setConfigs(result.data as ConfigItem[])
        }
      } catch {
        // 忽略错误
      }
    }

    loadConfigs()
  }, [])

  // 加载任务
  useEffect(() => {
    const loadTasks = async (): Promise<void> => {
      try {
        const api = getApiClient()
        const result = await api.listTasks()
        if (result.success && result.data) {
          setTasks(result.data as ParallelTask[])
        }
      } catch {
        // 忽略错误
      }
    }

    loadTasks()
    const interval = setInterval(loadTasks, 2000)
    return () => clearInterval(interval)
  }, [])

  // 处理初始消息
  useEffect(() => {
    if (initialMessage) {
      handleSubmit(initialMessage)
    }
  }, [])

  // 发送消息
  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: new Date()
      }

      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      setShowWelcome(false)

      try {
        setIsStreaming(true)
        setStreamingContent('')

        const api = getApiClient()
        await api.sendMessageStream(
          content,
          conversationId,
          model,
          (chunk) => {
            setStreamingContent((prev) => prev + chunk)
          },
          (response) => {
            setConversationId(response.conversationId)
            const assistantMessage: ChatMessage = {
              id: Date.now().toString(),
              role: 'assistant',
              content: response.response,
              timestamp: new Date()
            }
            setMessages((prev) => [...prev, assistantMessage])
            setIsStreaming(false)
            setStreamingContent('')
            setIsLoading(false)

            if (singleMode) {
              exit()
            }
          },
          (error) => {
            setSystemMessage(`错误: ${error}`)
            setIsStreaming(false)
            setStreamingContent('')
            setIsLoading(false)
          }
        )
      } catch (error) {
        setSystemMessage(`发送失败: ${error instanceof Error ? error.message : '未知错误'}`)
        setIsLoading(false)
        setIsStreaming(false)
      }
    },
    [conversationId, model, singleMode, exit]
  )

  // 处理输入
  const handleSubmit = useCallback(
    async (input: string): Promise<void> => {
      // 检查是否是命令
      if (input.startsWith('/')) {
        const result = await executeCommand(input)
        if (result) {
          if (result.message) {
            setSystemMessage(result.message)
          }
          if (result.exit) {
            exit()
          }
        }
        return
      }

      // 发送消息
      await sendMessage(input)
    },
    [sendMessage, exit]
  )

  // 键盘快捷键
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit()
    }
  })

  // 清除系统消息
  useEffect(() => {
    if (systemMessage) {
      const timer = setTimeout(() => setSystemMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [systemMessage])

  return (
    <Box flexDirection="column" padding={1}>
      {/* 状态栏 */}
      <StatusBar configs={configs} model={model} conversationId={conversationId} />

      {/* 欢迎信息 */}
      {showWelcome && <Welcome version={VERSION} />}

      {/* 消息列表 */}
      <Box flexDirection="column" flexGrow={1}>
        {messages.map((msg) => (
          <Message
            key={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
          />
        ))}

        {/* 流式响应 */}
        {isStreaming && (
          <StreamingMessage content={streamingContent} isComplete={false} />
        )}

        {/* 加载状态 */}
        {isLoading && !isStreaming && <LoadingSpinner />}

        {/* 系统消息 */}
        {systemMessage && (
          <Box marginY={1}>
            <Text color="yellow">{systemMessage}</Text>
          </Box>
        )}
      </Box>

      {/* 任务面板 */}
      <TaskPanel tasks={tasks} />

      {/* 输入框 */}
      <Box marginTop={1}>
        <InputBox onSubmit={handleSubmit} disabled={isLoading} />
      </Box>

      {/* 底部提示 */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Ctrl+C 退出 | /help 帮助 | (G)全局 (P)项目
        </Text>
      </Box>
    </Box>
  )
}
