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

    db.run(
      'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [id, conversationTitle, now, now]
    )

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

    const row = db.queryOne<ConversationRow>(
      'SELECT * FROM conversations WHERE id = ?',
      [conversationId]
    )

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

    db.run(
      'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
      [title, now, conversationId]
    )
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
    roleOrMessage: MessageRole | { role: MessageRole; content: string; metadata?: Record<string, unknown> },
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
        [id, conversationId, role, messageContent, now, messageMetadata ? JSON.stringify(messageMetadata) : null]
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
   */
  getMessages(conversationId: string): readonly Message[] {
    const db = getDatabase()

    const rows = db.query<MessageRow>(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC',
      [conversationId]
    )

    return rows.map((row) => ({
      id: row.id,
      role: row.role as MessageRole,
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    }))
  }

  /**
   * Get recent messages for a conversation (for context window)
   */
  getRecentMessages(conversationId: string, limit: number): readonly Message[] {
    const db = getDatabase()

    const rows = db.query<MessageRow>(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?',
      [conversationId, limit]
    )

    // Reverse to get chronological order
    return rows.reverse().map((row) => ({
      id: row.id,
      role: row.role as MessageRole,
      content: row.content,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
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
