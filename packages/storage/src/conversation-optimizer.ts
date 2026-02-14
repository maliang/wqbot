import { createModuleLogger, type ModelContextInfo } from '@wqbot/core'

const logger = createModuleLogger('conversation-optimizer')

// 优化器接受的消息格式
export interface OptimizerMessage {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly timestamp: Date
  readonly isSummary?: boolean
  readonly tokenCount?: number
}

// 优化配置
export interface OptimizationConfig {
  readonly pruneProtect: number    // 保护最近 N token 不被修剪
  readonly pruneMinimum: number    // 修剪量低于此值不执行
  readonly longMessageThreshold: number  // 超长消息阈值（token）
  readonly recentRoundsProtect: number   // 保护最近 N 轮用户消息
}

// 默认配置
const DEFAULT_CONFIG: OptimizationConfig = {
  pruneProtect: 40000,
  pruneMinimum: 20000,
  longMessageThreshold: 1000,
  recentRoundsProtect: 2,
}

// ModelContext 是 ModelContextInfo 的别名（向后兼容）
export type ModelContext = ModelContextInfo

// 优化结果
export interface OptimizationResult {
  readonly messages: readonly OptimizerMessage[]
  readonly originalTokens: number
  readonly optimizedTokens: number
  readonly pruned: number
  readonly summarized: boolean
  readonly summaryText?: string
}

// 消息重要性评分（保留用于排序）
export interface MessageImportance {
  readonly messageId: string
  readonly score: number
  readonly factors: {
    readonly recency: number
    readonly length: number
    readonly keywords: number
    readonly userMarked: number
    readonly hasCode: number
    readonly hasError: number
  }
}

// 简单的 Token 估算（中英文混合）
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

function estimateMessagesTokens(messages: readonly OptimizerMessage[]): number {
  return messages.reduce((sum, msg) => sum + (msg.tokenCount ?? estimateTokens(msg.content)), 0)
}

export class ConversationOptimizer {
  private config: OptimizationConfig
  private pinnedMessages: Set<string> = new Set()

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  updateConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): OptimizationConfig {
    return this.config
  }

  pinMessage(messageId: string): void {
    this.pinnedMessages.add(messageId)
  }

  unpinMessage(messageId: string): void {
    this.pinnedMessages.delete(messageId)
  }

  isPinned(messageId: string): boolean {
    return this.pinnedMessages.has(messageId)
  }

  estimateTokens(text: string): number {
    return estimateTokens(text)
  }

  estimateMessagesTokens(messages: readonly OptimizerMessage[]): number {
    return estimateMessagesTokens(messages)
  }

  /**
   * 三阶段优化
   *
   * 阶段 1: 溢出检测 — 不超过可用上下文则直接返回
   * 阶段 2: 长消息修剪 — 截断旧的超长消息
   * 阶段 3: AI 摘要压缩 — 将早期消息压缩为摘要
   */
  async optimize(
    messages: readonly OptimizerMessage[],
    modelContext: ModelContext
  ): Promise<OptimizationResult> {
    const originalTokens = estimateMessagesTokens(messages)
    const usable = modelContext.contextWindow - modelContext.maxOutputTokens

    // === 阶段 1: 溢出检测 ===
    if (originalTokens <= usable) {
      logger.debug('Token 未溢出，无需优化', { originalTokens, usable })
      return {
        messages,
        originalTokens,
        optimizedTokens: originalTokens,
        pruned: 0,
        summarized: false,
      }
    }

    logger.info('Token 溢出，开始优化', { originalTokens, usable, overflow: originalTokens - usable })

    // === 阶段 2: 长消息修剪 ===
    const pruned = this.pruneLongMessages(messages, usable)
    const prunedTokens = estimateMessagesTokens(pruned)

    if (prunedTokens <= usable) {
      logger.info('阶段 2 修剪后 Token 已在范围内', { prunedTokens, usable })
      return {
        messages: pruned,
        originalTokens,
        optimizedTokens: prunedTokens,
        pruned: messages.length - pruned.length,
        summarized: false,
      }
    }

    // === 阶段 3: AI 摘要压缩 ===
    const { messages: summarized, summaryText } = this.compressWithSummary(pruned, usable)
    const summarizedTokens = estimateMessagesTokens(summarized)

    logger.info('阶段 3 摘要压缩完成', {
      summarizedTokens,
      usable,
      messagesRemoved: messages.length - summarized.length,
    })

    return {
      messages: summarized,
      originalTokens,
      optimizedTokens: summarizedTokens,
      pruned: messages.length - summarized.length,
      summarized: true,
      summaryText,
    }
  }

  /**
   * 阶段 2: 长消息修剪
   *
   * 从后向前遍历，跳过最近 N 轮用户消息，
   * 累积 token 超过 pruneProtect 后，将超长消息截断。
   */
  private pruneLongMessages(
    messages: readonly OptimizerMessage[],
    _usable: number
  ): readonly OptimizerMessage[] {
    const { pruneProtect, pruneMinimum, longMessageThreshold, recentRoundsProtect } = this.config

    // 找到保护边界：最近 N 轮用户消息的索引
    let userRoundsFound = 0
    let protectFromIndex = messages.length

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!
      if (msg.role === 'user') {
        userRoundsFound++
        if (userRoundsFound >= recentRoundsProtect) {
          protectFromIndex = i
          break
        }
      }
    }

    // 从后向前累积 token，超过 pruneProtect 后开始修剪
    let accumulatedTokens = 0
    let potentialSavings = 0
    const pruneTargets: Set<number> = new Set()

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!
      const msgTokens = msg.tokenCount ?? estimateTokens(msg.content)
      accumulatedTokens += msgTokens

      // 在保护区内不修剪
      if (i >= protectFromIndex) continue
      // pinned 消息不修剪
      if (this.pinnedMessages.has(msg.id)) continue

      if (accumulatedTokens > pruneProtect && msgTokens > longMessageThreshold) {
        pruneTargets.add(i)
        potentialSavings += msgTokens - estimateTokens('[历史内容已清理]')
      }
    }

    // 修剪量不足则不执行
    if (potentialSavings < pruneMinimum) {
      logger.debug('修剪量不足，跳过阶段 2', { potentialSavings, pruneMinimum })
      return messages
    }

    return messages.map((msg, i) => {
      if (pruneTargets.has(i)) {
        return {
          ...msg,
          content: '[历史内容已清理]',
          tokenCount: estimateTokens('[历史内容已清理]'),
        }
      }
      return msg
    })
  }

  /**
   * 阶段 3: 摘要压缩
   *
   * 将早期消息替换为一条摘要消息。
   * 当前使用简单文本拼接，后续可接入 AI 生成摘要。
   */
  private compressWithSummary(
    messages: readonly OptimizerMessage[],
    usable: number
  ): { messages: readonly OptimizerMessage[]; summaryText: string } {
    // 从最新消息向前保留，直到 token 接近 usable 的 80%
    const targetTokens = Math.floor(usable * 0.8)
    let keptTokens = 0
    let splitIndex = messages.length

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]!
      const msgTokens = msg.tokenCount ?? estimateTokens(msg.content)
      if (keptTokens + msgTokens > targetTokens) {
        splitIndex = i + 1
        break
      }
      keptTokens += msgTokens
      if (i === 0) splitIndex = 0
    }

    // 至少保留最后一条消息
    if (splitIndex >= messages.length) {
      splitIndex = Math.max(0, messages.length - 1)
    }

    const removedMessages = messages.slice(0, splitIndex)
    const keptMessages = messages.slice(splitIndex)

    if (removedMessages.length === 0) {
      return { messages, summaryText: '' }
    }

    // 生成摘要文本
    const summaryText = this.generateSummaryText(removedMessages)

    const summaryMessage: OptimizerMessage = {
      id: `summary-${Date.now()}`,
      role: 'system',
      content: summaryText,
      timestamp: new Date(),
      isSummary: true,
      tokenCount: estimateTokens(summaryText),
    }

    return {
      messages: [summaryMessage, ...keptMessages],
      summaryText,
    }
  }

  /**
   * 生成摘要文本（简化版）
   * TODO: 接入 AI 小模型生成更精确的摘要
   */
  private generateSummaryText(messages: readonly OptimizerMessage[]): string {
    const userMessages = messages.filter(m => m.role === 'user')
    const assistantMessages = messages.filter(m => m.role === 'assistant')

    // 提取用户提问的关键主题
    const topics: string[] = []
    for (const msg of userMessages) {
      const firstLine = (msg.content.split('\n')[0] ?? '').slice(0, 80)
      if (firstLine.trim()) {
        topics.push(firstLine.trim())
      }
    }

    const topicSummary = topics.length > 0
      ? topics.slice(0, 5).map(t => `- ${t}`).join('\n')
      : '（无具体主题）'

    return [
      `[对话历史摘要] 以下是之前 ${messages.length} 条消息的摘要（${userMessages.length} 条用户消息，${assistantMessages.length} 条助手回复）：`,
      '',
      '用户讨论的主题：',
      topicSummary,
      '',
      '请基于以上摘要继续对话。',
    ].join('\n')
  }
}

// 单例
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
