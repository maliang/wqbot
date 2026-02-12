import { createModuleLogger } from '@wqbot/core'
import type { Message, Conversation } from '@wqbot/core'

const logger = createModuleLogger('conversation-optimizer')

// 优化策略配置
export interface OptimizationConfig {
  readonly maxTokens: number          // 最大 Token 数
  readonly windowSize: number         // 滑动窗口大小（消息数）
  readonly summaryThreshold: number   // 触发摘要的消息数阈值
  readonly importanceDecay: number    // 重要性衰减系数 (0-1)
  readonly minImportance: number      // 最小重要性阈值
}

// 默认配置
const DEFAULT_CONFIG: OptimizationConfig = {
  maxTokens: 8000,
  windowSize: 20,
  summaryThreshold: 10,
  importanceDecay: 0.1,
  minImportance: 0.3
}

// 消息重要性评分
export interface MessageImportance {
  readonly messageId: string
  readonly score: number
  readonly factors: {
    readonly recency: number      // 时间新近度
    readonly length: number       // 内容长度
    readonly keywords: number     // 关键词匹配
    readonly userMarked: number   // 用户标记
    readonly hasCode: number      // 包含代码
    readonly hasError: number     // 包含错误信息
  }
}

// 优化结果
export interface OptimizationResult {
  readonly originalCount: number
  readonly optimizedCount: number
  readonly removedCount: number
  readonly estimatedTokensSaved: number
  readonly summary?: string
  readonly messages: readonly Message[]
}

// 简单的 Token 估算（中英文混合）
function estimateTokens(text: string): number {
  // 粗略估算：英文约 4 字符/token，中文约 1.5 字符/token
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

// 关键词列表（用于重要性评分）
const IMPORTANT_KEYWORDS = [
  'error', 'bug', 'fix', 'important', 'critical', 'urgent',
  '错误', '问题', '重要', '紧急', '修复', '关键',
  'todo', 'note', 'remember', '注意', '记住', '待办'
]

export class ConversationOptimizer {
  private config: OptimizationConfig
  private pinnedMessages: Set<string> = new Set()

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  // 更新配置
  updateConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // 获取当前配置
  getConfig(): OptimizationConfig {
    return this.config
  }

  // 标记消息为重要
  pinMessage(messageId: string): void {
    this.pinnedMessages.add(messageId)
  }

  // 取消标记
  unpinMessage(messageId: string): void {
    this.pinnedMessages.delete(messageId)
  }

  // 检查是否已标记
  isPinned(messageId: string): boolean {
    return this.pinnedMessages.has(messageId)
  }

  // 计算消息重要性
  calculateImportance(message: Message, index: number, totalMessages: number): MessageImportance {
    const content = message.content

    // 时间新近度（越新越重要）
    const recency = 1 - (index / totalMessages) * this.config.importanceDecay

    // 内容长度（适中长度更重要）
    const length = Math.min(content.length / 500, 1) * 0.5 + 0.5

    // 关键词匹配
    const keywordMatches = IMPORTANT_KEYWORDS.filter((kw) =>
      content.toLowerCase().includes(kw.toLowerCase())
    ).length
    const keywords = Math.min(keywordMatches / 3, 1)

    // 用户标记
    const userMarked = this.pinnedMessages.has(message.id) ? 1 : 0

    // 包含代码
    const hasCode = /```[\s\S]*?```|`[^`]+`/.test(content) ? 0.8 : 0

    // 包含错误信息
    const hasError = /error|exception|failed|失败|错误/i.test(content) ? 0.7 : 0

    // 综合评分
    const score = Math.min(
      1,
      recency * 0.3 +
        length * 0.1 +
        keywords * 0.2 +
        userMarked * 0.3 +
        hasCode * 0.05 +
        hasError * 0.05
    )

    return {
      messageId: message.id,
      score,
      factors: {
        recency,
        length,
        keywords,
        userMarked,
        hasCode,
        hasError
      }
    }
  }

  // 滑动窗口策略
  applySlidingWindow(messages: readonly Message[]): readonly Message[] {
    if (messages.length <= this.config.windowSize) {
      return messages
    }

    // 保留最近的 windowSize 条消息
    const startIndex = messages.length - this.config.windowSize
    return messages.slice(startIndex)
  }

  // 基于重要性的过滤
  applyImportanceFilter(messages: readonly Message[]): readonly Message[] {
    const importanceScores = messages.map((msg, index) =>
      this.calculateImportance(msg, index, messages.length)
    )

    // 过滤掉重要性低于阈值的消息（但保留用户标记的）
    return messages.filter((msg, index) => {
      const importance = importanceScores[index]
      if (!importance) return true
      return importance.score >= this.config.minImportance || this.pinnedMessages.has(msg.id)
    })
  }

  // 生成历史摘要（简化版，实际应调用 AI）
  generateSummary(messages: readonly Message[]): string {
    if (messages.length === 0) {
      return ''
    }

    // 提取关键信息
    const userMessages = messages.filter((m) => m.role === 'user')
    const topics = new Set<string>()

    for (const msg of userMessages) {
      // 简单提取主题（实际应使用 NLP 或 AI）
      const words = msg.content.split(/\s+/).slice(0, 5)
      words.forEach((w) => {
        if (w.length > 2) {
          topics.add(w)
        }
      })
    }

    const topicList = Array.from(topics).slice(0, 5).join('、')

    return `[历史摘要] 之前的对话涉及以下主题：${topicList}。共 ${messages.length} 条消息。`
  }

  // 优化对话
  optimize(conversation: Conversation): OptimizationResult {
    const originalMessages = conversation.messages
    const originalCount = originalMessages.length

    if (originalCount === 0) {
      return {
        originalCount: 0,
        optimizedCount: 0,
        removedCount: 0,
        estimatedTokensSaved: 0,
        messages: []
      }
    }

    // 估算原始 Token 数
    const originalTokens = originalMessages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0
    )

    let optimizedMessages: readonly Message[] = originalMessages
    let summary: string | undefined

    // 如果超过 Token 限制，应用优化策略
    if (originalTokens > this.config.maxTokens) {
      logger.debug('开始优化对话', {
        originalCount,
        originalTokens,
        maxTokens: this.config.maxTokens
      })

      // 1. 应用滑动窗口
      optimizedMessages = this.applySlidingWindow(optimizedMessages)

      // 2. 如果仍然超过限制，应用重要性过滤
      let currentTokens = optimizedMessages.reduce(
        (sum, msg) => sum + estimateTokens(msg.content),
        0
      )

      if (currentTokens > this.config.maxTokens) {
        optimizedMessages = this.applyImportanceFilter(optimizedMessages)
      }

      // 3. 如果消息被移除，生成摘要
      const removedMessages = originalMessages.slice(
        0,
        originalCount - optimizedMessages.length
      )
      if (removedMessages.length >= this.config.summaryThreshold) {
        summary = this.generateSummary(removedMessages)
      }

      currentTokens = optimizedMessages.reduce(
        (sum, msg) => sum + estimateTokens(msg.content),
        0
      )

      logger.debug('优化完成', {
        optimizedCount: optimizedMessages.length,
        currentTokens,
        hasSummary: !!summary
      })
    }

    const optimizedTokens = optimizedMessages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0
    )

    return {
      originalCount,
      optimizedCount: optimizedMessages.length,
      removedCount: originalCount - optimizedMessages.length,
      estimatedTokensSaved: originalTokens - optimizedTokens,
      summary: summary ?? '',
      messages: optimizedMessages
    }
  }

  // 手动压缩（强制应用所有策略）
  compact(conversation: Conversation): OptimizationResult {
    const originalMessages = conversation.messages
    const originalCount = originalMessages.length

    if (originalCount === 0) {
      return {
        originalCount: 0,
        optimizedCount: 0,
        removedCount: 0,
        estimatedTokensSaved: 0,
        messages: []
      }
    }

    const originalTokens = originalMessages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0
    )

    // 强制应用滑动窗口（使用一半的窗口大小）
    const compactWindowSize = Math.ceil(this.config.windowSize / 2)
    let compactedMessages: readonly Message[] = originalMessages

    if (originalCount > compactWindowSize) {
      compactedMessages = originalMessages.slice(originalCount - compactWindowSize)
    }

    // 应用重要性过滤
    compactedMessages = this.applyImportanceFilter(compactedMessages)

    // 生成摘要
    const removedMessages = originalMessages.slice(
      0,
      originalCount - compactedMessages.length
    )
    const summary = removedMessages.length > 0 ? this.generateSummary(removedMessages) : undefined

    const compactedTokens = compactedMessages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0
    )

    logger.info('手动压缩完成', {
      originalCount,
      compactedCount: compactedMessages.length,
      tokensSaved: originalTokens - compactedTokens
    })

    return {
      originalCount,
      optimizedCount: compactedMessages.length,
      removedCount: originalCount - compactedMessages.length,
      estimatedTokensSaved: originalTokens - compactedTokens,
      summary: summary ?? '',
      messages: compactedMessages
    }
  }

  // 估算 Token 数
  estimateTokens(text: string): number {
    return estimateTokens(text)
  }

  // 估算对话 Token 数
  estimateConversationTokens(conversation: Conversation): number {
    return conversation.messages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0
    )
  }
}

// 单例实例
let optimizerInstance: ConversationOptimizer | null = null

export function getConversationOptimizer(): ConversationOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new ConversationOptimizer()
  }
  return optimizerInstance
}

export function initializeConversationOptimizer(
  config?: Partial<OptimizationConfig>
): ConversationOptimizer {
  optimizerInstance = new ConversationOptimizer(config)
  return optimizerInstance
}
