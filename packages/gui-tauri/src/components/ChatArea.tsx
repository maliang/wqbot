import React, { useState, useRef, useEffect } from 'react'
import type { Message } from '../api'
import './ChatArea.css'

interface ChatAreaProps {
  messages: Message[]
  streamingContent: string
  isLoading: boolean
  onSend: (content: string) => void
}

const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  streamingContent,
  isLoading,
  onSend
}) => {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // 自动调整输入框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  const handleSubmit = () => {
    if (input.trim() && !isLoading) {
      onSend(input.trim())
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
        <span className="chat-title">对话</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !streamingContent && (
          <div className="empty-chat">
            <div className="empty-chat-icon">💬</div>
            <div className="empty-chat-text">开始新对话</div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-header">
              <span className={`message-role ${msg.role}`}>
                {msg.role === 'user' ? '你' : 'AI'}
              </span>
              <span className="message-time">{formatTime(msg.timestamp)}</span>
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {streamingContent && (
          <div className="message assistant streaming">
            <div className="message-header">
              <span className="message-role assistant">AI</span>
            </div>
            <div className="message-content">{streamingContent}</div>
          </div>
        )}

        {isLoading && !streamingContent && (
          <div className="loading-indicator">
            <div className="loading-dots">
              <div className="loading-dot"></div>
              <div className="loading-dot"></div>
              <div className="loading-dot"></div>
            </div>
            <span>思考中...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="input-container">
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              className="input chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              disabled={isLoading}
              rows={1}
            />
          </div>
          <button
            className="btn btn-primary send-btn"
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatArea
