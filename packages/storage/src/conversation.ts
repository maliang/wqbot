import { getDatabase } from './database.js'
import { createModuleLogger, generateId } from '@wqbot/core'
import type { Message, Conversation, MessageRole } from '@wqbot/core'

const logger = createModuleLogger('conversation-store')

// Database row types
interface ConversationRow {
  id: string
  title: string
  created_at: string
  updated_at: string
  metadata: string | null
}

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  timestamp: string
  metadata: string | null
  compacted_at: string | null
  is_summary: number
  token_count: number | null
  is_pinned: number
}

export interface SearchResult {
  readonly conversationId: string
  readonly conversationTitle: string
  readonly messageId: string
  readonly content: string
  readonly timestamp: Date
  readonly relevance: number
}

export class ConversationStore {
  /**
   * Create a new conversation
   */
  createConversation(title?: string): Conversation {
    const db = getDatabase()
    const id = generateId('conv')
    const now = new Date().toISOString()
    const conversationTitle = title ?? `Conversation ${new Date().toLocaleDateString()}`

    db.run('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      id,
      conversationTitle,
      now,
      now,
    ])

    logger.debug('Created conversation', { conversationId: id, title: conversationTitle })

    return {
      id,
      title: conversationTitle,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      messages: [],
    }
  }

  /**
   * Get a conversation by ID
   */
  getConversation(conversationId: string): Conversation | undefined {
    const db = getDatabase()

    const row = db.queryOne<ConversationRow>('SELECT * FROM conversations WHERE id = ?', [
      conversationId,
    ])

    if (!row) {
      return undefined
    }

    const messages = this.getMessages(conversationId)

    return {
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messages,
    }
  }

  /**
   * List conversations with pagination
   */
  listConversations(limit = 50, offset = 0): readonly Conversation[] {
    const db = getDatabase()

    const rows = db.query<ConversationRow>(
      'SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    )

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messages: [], // Don't load messages for list view
    }))
  }

  /**
   * Update conversation title
   */
  updateConversationTitle(conversationId: string, title: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()

    db.run('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?', [
      title,
      now,
      conversationId,
    ])
  }

  /**
   * Delete a conversation and all its messages
   */
  deleteConversation(conversationId: string): void {
    const db = getDatabase()

    db.transaction(() => {
      db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId])
      db.run('DELETE FROM conversations WHERE id = ?', [conversationId])
    })

    logger.debug('Deleted conversation', { conversationId })
  }

  /**
   * Add a message to a conversation
   */
  addMessage(
    conversationId: string,
    message: { role: MessageRole; content: string; metadata?: Record<string, unknown> }
  ): Message
  addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>
  ): Message
  addMessage(
    conversationId: string,
    roleOrMessage:
      | MessageRole
      | { role: MessageRole; content: string; metadata?: Record<string, unknown> },
    content?: string,
    metadata?: Record<string, unknown>
  ): Message {
    const db = getDatabase()
    const id = generateId('msg')
    const now = new Date().toISOString()

    // 支持两种调用方式
    let role: MessageRole
    let messageContent: string
    let messageMetadata: Record<string, unknown> | undefined

    if (typeof roleOrMessage === 'object') {
      role = roleOrMessage.role
      messageContent = roleOrMessage.content
      messageMetadata = roleOrMessage.metadata
    } else {
      role = roleOrMessage
      messageContent = content!
      messageMetadata = metadata
    }

    db.transaction(() => {
      db.run(
        'INSERT INTO messages (id, conversation_id, role, content, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)',
        [
          id,
          conversationId,
          role,
          messageContent,
          now,
          messageMetadata ? JSON.stringify(messageMetadata) : null,
        ]
      )

      db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId])
    })

    logger.debug('Added message', { conversationId, messageId: id, role })

    return {
      id,
      role,
      content: messageContent,
      timestamp: new Date(now),
      metadata: messageMetadata,
    }
  }

  /**
   * Get all messages for a conversation
   * 从最新消息向前加载，遇到 is_summary=1 的消息停止加载更早消息
   */
  getMessages(conversationId: string): readonly Message[] {
    const db = getDatabase()

    // 先查找最近的摘要消息
    const summaryRow = db.queryOne<MessageRow>(
      'SELECT * FROM messages WHERE conversation_id = ? AND is_summary = 1 ORDER BY timestamp DESC LIMIT 1',
      [conversationId]
    )

    let rows: MessageRow[]
    if (summaryRow) {
      // 加载摘要消息及其之后的所有消息
      rows = db.query<MessageRow>(
        'SELECT * FROM messages WHERE conversation_id = ? AND timestamp >= ? ORDER BY timestamp ASC',
        [conversationId, summaryRow.timestamp]
      )
    } else {
      rows = db.query<MessageRow>(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
        [conversationId]
      )
    }

    return rows.map((row) => ({
      id: row.id,
      role: row.role as MessageRole,
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
      compactedAt: row.compacted_at ? new Date(row.compacted_at) : undefined,
      isSummary: row.is_summary === 1,
      tokenCount: row.token_count ?? undefined,
      isPinned: row.is_pinned === 1,
    }))
  }

  /**
   * Get recent messages for a conversation (for context window)
   * 同样尊重 is_summary 边界
   */
  getRecentMessages(conversationId: string, limit: number): readonly Message[] {
    const db = getDatabase()

    const rows = db.query<MessageRow>(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?',
      [conversationId, limit]
    )

    // 检查是否包含摘要消息，如果有则截断到摘要
    const reversed = rows.reverse()
    const summaryIndex = reversed.findIndex((r) => r.is_summary === 1)

    const effective = summaryIndex >= 0 ? reversed.slice(summaryIndex) : reversed

    return effective.map((row) => ({
      id: row.id,
      role: row.role as MessageRole,
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
      compactedAt: row.compacted_at ? new Date(row.compacted_at) : undefined,
      isSummary: row.is_summary === 1,
      tokenCount: row.token_count ?? undefined,
      isPinned: row.is_pinned === 1,
    }))
  }

  /**
   * 标记消息为已压缩（被摘要替代）
   */
  markCompacted(messageIds: readonly string[]): void {
    if (messageIds.length === 0) return
    const db = getDatabase()
    const now = new Date().toISOString()
    const placeholders = messageIds.map(() => '?').join(',')
    db.run(`UPDATE messages SET compacted_at = ? WHERE id IN (${placeholders})`, [
      now,
      ...messageIds,
    ])
  }

  /**
   * 添加摘要消息到对话
   */
  addSummaryMessage(conversationId: string, content: string): Message {
    const db = getDatabase()
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    db.run(
      'INSERT INTO messages (id, conversation_id, role, content, timestamp, is_summary) VALUES (?, ?, ?, ?, ?, 1)',
      [id, conversationId, 'system', content, now]
    )

    return {
      id,
      role: 'system' as MessageRole,
      content,
      timestamp: new Date(now),
    }
  }

  /**
   * 获取带 token 信息的消息（供优化器使用）
   */
  getMessagesForOptimizer(conversationId: string): readonly {
    id: string
    role: string
    content: string
    timestamp: Date
    isSummary: boolean
    tokenCount: number | null
  }[] {
    const db = getDatabase()

    const rows = db.query<MessageRow>(
      'SELECT * FROM messages WHERE conversation_id = ? AND compacted_at IS NULL ORDER BY timestamp ASC',
      [conversationId]
    )

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.timestamp),
      isSummary: row.is_summary === 1,
      tokenCount: row.token_count,
    }))
  }

  /**
   * Search across all conversations
   */
  search(query: string, limit = 20): readonly SearchResult[] {
    const db = getDatabase()

    // Simple LIKE search - could be enhanced with FTS5
    const searchPattern = `%${query}%`

    const rows = db.query<{
      conversation_id: string
      conversation_title: string
      message_id: string
      content: string
      timestamp: string
    }>(
      `SELECT
        m.conversation_id,
        c.title as conversation_title,
        m.id as message_id,
        m.content,
        m.timestamp
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.content LIKE ?
      ORDER BY m.timestamp DESC
      LIMIT ?`,
      [searchPattern, limit]
    )

    return rows.map((row, index) => ({
      conversationId: row.conversation_id,
      conversationTitle: row.conversation_title,
      messageId: row.message_id,
      content: row.content,
      timestamp: new Date(row.timestamp),
      relevance: 1 - index / rows.length, // Simple relevance based on recency
    }))
  }

  /**
   * Export a conversation to JSON or Markdown
   */
  export(conversationId: string, format: 'json' | 'md'): string {
    const conversation = this.getConversation(conversationId)
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`)
    }

    if (format === 'json') {
      return JSON.stringify(conversation, null, 2)
    }

    // Markdown format
    let md = `# ${conversation.title}\n\n`
    md += `*Created: ${conversation.createdAt.toLocaleString()}*\n\n`
    md += `---\n\n`

    for (const message of conversation.messages) {
      const roleLabel = message.role === 'user' ? '**User**' : '**Assistant**'
      md += `${roleLabel} (${message.timestamp.toLocaleTimeString()}):\n\n`
      md += `${message.content}\n\n`
      md += `---\n\n`
    }

    return md
  }

  /**
   * Get conversation count
   */
  getConversationCount(): number {
    const db = getDatabase()
    const result = db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM conversations')
    return result?.count ?? 0
  }

  /**
   * Get message count for a conversation
   */
  getMessageCount(conversationId: string): number {
    const db = getDatabase()
    const result = db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?',
      [conversationId]
    )
    return result?.count ?? 0
  }

  /**
   * Pin a message (mark as important)
   */
  pinMessage(messageId: string, conversationId: string): void {
    const db = getDatabase()
    db.run('UPDATE messages SET is_pinned = 1 WHERE id = ? AND conversation_id = ?', [
      messageId,
      conversationId,
    ])
    logger.debug('Pinned message', { messageId, conversationId })
  }

  /**
   * Unpin a message
   */
  unpinMessage(messageId: string, conversationId: string): void {
    const db = getDatabase()
    db.run('UPDATE messages SET is_pinned = 0 WHERE id = ? AND conversation_id = ?', [
      messageId,
      conversationId,
    ])
    logger.debug('Unpinned message', { messageId, conversationId })
  }

  /**
   * Check if a message is pinned
   */
  isPinned(messageId: string, conversationId: string): boolean {
    const db = getDatabase()
    const result = db.queryOne<{ is_pinned: number }>(
      'SELECT is_pinned FROM messages WHERE id = ? AND conversation_id = ?',
      [messageId, conversationId]
    )
    return result?.is_pinned === 1
  }

  /**
   * Get pinned messages for a conversation
   */
  getPinnedMessages(conversationId: string): readonly Message[] {
    const db = getDatabase()
    const rows = db.query<{
      id: string
      conversation_id: string
      role: MessageRole
      content: string
      timestamp: string
      metadata: string | null
      compacted_at: string | null
      is_summary: number
      token_count: number | null
      is_pinned: number
    }>(
      'SELECT * FROM messages WHERE conversation_id = ? AND is_pinned = 1 ORDER BY timestamp ASC',
      [conversationId]
    )
    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      compactedAt: row.compacted_at ? new Date(row.compacted_at) : undefined,
      isSummary: row.is_summary === 1,
      tokenCount: row.token_count ?? undefined,
      isPinned: row.is_pinned === 1,
    }))
  }
}

// Singleton instance
let storeInstance: ConversationStore | null = null

export function getConversationStore(): ConversationStore {
  if (!storeInstance) {
    storeInstance = new ConversationStore()
  }
  return storeInstance
}

export async function initializeConversationStore(): Promise<ConversationStore> {
  return getConversationStore()
}
