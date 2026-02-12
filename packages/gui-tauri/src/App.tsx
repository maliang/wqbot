import React, { useEffect, useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ChatArea from './components/ChatArea'
import ConfigPanel from './components/ConfigPanel'
import TaskProgress from './components/TaskProgress'
import Settings from './components/Settings'
import './components/Settings.css'
import { useChatStore, useConfigStore, useTaskStore } from './hooks/useStore'
import api from './api'

// Tauri API（如果可用）
declare global {
  interface Window {
    __TAURI__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
    }
  }
}

const App: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [isCheckingConfig, setIsCheckingConfig] = useState(true)
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting')
  const [retryCount, setRetryCount] = useState(0)

  const {
    conversations,
    currentConversationId,
    messages,
    isLoading,
    streamingContent,
    loadConversations,
    selectConversation,
    createConversation,
    deleteConversation,
    sendMessage
  } = useChatStore()

  const { configs, loadConfigs, toggleConfig } = useConfigStore()
  const { tasks, loadTasks, cancelTask, cancelAllTasks } = useTaskStore()

  // 检查后端连接
  const checkBackendConnection = useCallback(async (): Promise<boolean> => {
    try {
      const result = await api.health()
      return result.success
    } catch {
      return false
    }
  }, [])

  // 等待后端启动（带重试）
  useEffect(() => {
    let cancelled = false
    const maxRetries = 10
    const retryDelay = 1000 // 1秒

    const waitForBackend = async () => {
      for (let i = 0; i < maxRetries && !cancelled; i++) {
        setRetryCount(i + 1)
        const connected = await checkBackendConnection()

        if (connected) {
          setBackendStatus('connected')
          // 后端已连接，检查配置
          try {
            const result = await api.getSettings()
            if (result.success && result.data) {
              const data = result.data as Record<string, unknown>
              const hasApiKey =
                data.openaiApiKey ||
                data.anthropicApiKey ||
                data.deepseekApiKey ||
                data.ollamaHost

              if (!hasApiKey) {
                setIsFirstRun(true)
                setShowSettings(true)
              }
            }
          } catch {
            setIsFirstRun(true)
          }
          setIsCheckingConfig(false)
          return
        }

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }

      // 超过最大重试次数
      if (!cancelled) {
        setBackendStatus('failed')
        setIsCheckingConfig(false)
      }
    }

    waitForBackend()

    return () => {
      cancelled = true
    }
  }, [checkBackendConnection])

  // 初始化加载
  useEffect(() => {
    if (!isCheckingConfig && backendStatus === 'connected' && !isFirstRun) {
      loadConversations()
      loadConfigs()
      loadTasks()

      // 定期刷新任务
      const taskInterval = setInterval(loadTasks, 2000)
      return () => clearInterval(taskInterval)
    }
    return undefined
  }, [isCheckingConfig, backendStatus, isFirstRun])

  // 处理设置关闭
  const handleSettingsClose = () => {
    setShowSettings(false)
    if (isFirstRun) {
      setIsFirstRun(false)
      // 重新加载数据
      loadConversations()
      loadConfigs()
      loadTasks()
    }
  }

  // 重试连接后端
  const handleRetryConnection = async () => {
    setBackendStatus('connecting')
    setRetryCount(0)
    setIsCheckingConfig(true)

    // 尝试通过 Tauri 重启后端
    if (window.__TAURI__) {
      try {
        await window.__TAURI__.invoke('restart_backend')
      } catch {
        // 忽略错误
      }
    }

    // 等待一下再检查
    await new Promise(resolve => setTimeout(resolve, 2000))

    const connected = await checkBackendConnection()
    if (connected) {
      setBackendStatus('connected')
      // 检查配置
      try {
        const result = await api.getSettings()
        if (result.success && result.data) {
          const data = result.data as Record<string, unknown>
          const hasApiKey =
            data.openaiApiKey ||
            data.anthropicApiKey ||
            data.deepseekApiKey ||
            data.ollamaHost

          if (!hasApiKey) {
            setIsFirstRun(true)
            setShowSettings(true)
          }
        }
      } catch {
        setIsFirstRun(true)
      }
    } else {
      setBackendStatus('failed')
    }
    setIsCheckingConfig(false)
  }

  // 加载中状态 - 等待后端启动
  if (isCheckingConfig) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div className="spinner" style={{ fontSize: '32px', marginBottom: '16px' }}>⚙️</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>正在启动后端服务...</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            尝试连接中 ({retryCount}/10)
          </div>
        </div>
      </div>
    )
  }

  // 后端连接失败
  if (backendStatus === 'failed') {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ marginBottom: '12px', color: 'var(--error)' }}>无法连接后端服务</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
            后端服务启动失败或未响应。请确保：
          </p>
          <ul style={{ textAlign: 'left', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.8' }}>
            <li>已正确安装 WQBot CLI</li>
            <li>Node.js 环境可用</li>
            <li>端口 3721 未被占用</li>
          </ul>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={handleRetryConnection}>
              重试连接
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setBackendStatus('connected')
                setIsFirstRun(true)
                setShowSettings(true)
              }}
            >
              跳过检查
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* 设置弹窗 */}
      {showSettings && (
        <Settings onClose={handleSettingsClose} />
      )}

      {/* 首次运行提示 */}
      {isFirstRun && !showSettings && (
        <div className="first-run-overlay">
          <div className="first-run-modal">
            <h2>欢迎使用 WQBot</h2>
            <p>首次使用需要配置 AI 模型 API</p>
            <button
              className="btn btn-primary"
              onClick={() => setShowSettings(true)}
            >
              开始配置
            </button>
          </div>
        </div>
      )}

      {/* 左侧栏 - 对话列表 */}
      <Sidebar
        conversations={conversations}
        currentId={currentConversationId}
        onSelect={selectConversation}
        onCreate={() => createConversation()}
        onDelete={deleteConversation}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* 中间区域 - 对话内容 */}
      <div className="main-content">
        <ChatArea
          messages={messages}
          streamingContent={streamingContent}
          isLoading={isLoading}
          onSend={sendMessage}
        />

        {/* 任务进度 */}
        <TaskProgress
          tasks={tasks}
          onCancel={cancelTask}
          onCancelAll={cancelAllTasks}
        />
      </div>

      {/* 右侧栏 - 配置面板 */}
      <ConfigPanel configs={configs} onToggle={toggleConfig} />
    </div>
  )
}

export default App
