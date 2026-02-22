import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock database and core dependencies
const mockDb = {
  run: vi.fn(),
  query: vi.fn().mockReturnValue([]),
  queryOne: vi.fn().mockReturnValue(null),
  transaction: vi.fn((fn) => fn()),
}

vi.mock('../src/database.js', () => ({
  getDatabase: () => mockDb,
}))

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  generateId: (prefix: string) => `${prefix}_test123`,
}))

import { ConversationStore, getConversationStore, initializeConversationStore } from '../src/conversation.js'

describe('ConversationStore', () => {
  let store: ConversationStore

  beforeEach(() => {
    vi.clearAllMocks()
    store = new ConversationStore()
  })

  describe('createConversation', () => {
    it('creates a new conversation with default title', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 })

      const conversation = store.createConversation()

      expect(conversation.id).toBeDefined()
      expect(conversation.title).toContain('Conversation')
      expect(conversation.messages).toEqual([])
    })

    it('creates a new conversation with custom title', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 })

      const conversation = store.createConversation('My Chat')

      expect(conversation.title).toBe('My Chat')
    })
  })

  describe('getConversation', () => {
    it('returns undefined for non-existent conversation', () => {
      mockDb.queryOne.mockReturnValue(null)

      const conversation = store.getConversation('non-existent')

      expect(conversation).toBeUndefined()
    })

    it('returns conversation with messages', () => {
      // First call: get conversation, Second call: check for summary
      mockDb.queryOne
        .mockReturnValueOnce({
          id: 'conv_123',
          title: 'Test Chat',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
          metadata: null,
        })
        .mockReturnValueOnce(null) // No summary message

      mockDb.query.mockReturnValue([
        {
          id: 'msg_1',
          conversation_id: 'conv_123',
          role: 'user',
          content: 'Hello',
          timestamp: '2024-01-01T00:30:00Z',
          metadata: null,
          compacted_at: null,
          is_summary: 0,
          token_count: null,
          is_pinned: 0,
        },
      ])

      const conversation = store.getConversation('conv_123')

      expect(conversation).toBeDefined()
      expect(conversation!.id).toBe('conv_123')
      expect(conversation!.title).toBe('Test Chat')
      expect(conversation!.messages.length).toBe(1)
    })
  })

  describe('listConversations', () => {
    it('returns list of conversations', () => {
      mockDb.query.mockReturnValue([
        {
          id: 'conv_1',
          title: 'Chat 1',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
          metadata: null,
        },
        {
          id: 'conv_2',
          title: 'Chat 2',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T01:00:00Z',
          metadata: null,
        },
      ])

      const conversations = store.listConversations()

      expect(conversations.length).toBe(2)
      expect(conversations[0]!.title).toBe('Chat 1')
      expect(conversations[1]!.title).toBe('Chat 2')
    })

    it('respects limit and offset', () => {
      mockDb.query.mockReturnValue([])

      store.listConversations(10, 5)

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?'),
        [10, 5]
      )
    })
  })

  describe('updateConversationTitle', () => {
    it('updates conversation title', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })

      store.updateConversationTitle('conv_123', 'New Title')

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE conversations SET title'),
        expect.arrayContaining(['New Title', expect.any(String), 'conv_123'])
      )
    })
  })

  describe('deleteConversation', () => {
    it('deletes conversation and its messages', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })

      store.deleteConversation('conv_123')

      expect(mockDb.transaction).toHaveBeenCalled()
    })
  })

  describe('addMessage', () => {
    it('adds a message with role and content', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 })

      const message = store.addMessage('conv_123', 'user', 'Hello')

      expect(message.role).toBe('user')
      expect(message.content).toBe('Hello')
      expect(message.id).toBeDefined()
      expect(message.timestamp).toBeInstanceOf(Date)
    })

    it('adds a message with object parameter', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 1 })

      const message = store.addMessage('conv_123', {
        role: 'assistant',
        content: 'Hi there!',
        metadata: { model: 'gpt-4' },
      })

      expect(message.role).toBe('assistant')
      expect(message.content).toBe('Hi there!')
      expect(message.metadata).toEqual({ model: 'gpt-4' })
    })
  })

  describe('getMessages', () => {
    it('returns messages in order', () => {
      mockDb.queryOne.mockReturnValue(null) // No summary
      mockDb.query.mockReturnValue([
        {
          id: 'msg_1',
          conversation_id: 'conv_123',
          role: 'user',
          content: 'Hello',
          timestamp: '2024-01-01T00:00:00Z',
          metadata: null,
          compacted_at: null,
          is_summary: 0,
          token_count: 10,
          is_pinned: 0,
        },
        {
          id: 'msg_2',
          conversation_id: 'conv_123',
          role: 'assistant',
          content: 'Hi!',
          timestamp: '2024-01-01T00:01:00Z',
          metadata: null,
          compacted_at: null,
          is_summary: 0,
          token_count: 5,
          is_pinned: 1,
        },
      ])

      const messages = store.getMessages('conv_123')

      expect(messages.length).toBe(2)
      expect(messages[0]!.role).toBe('user')
      expect(messages[1]!.isPinned).toBe(true)
    })

    it('stops at summary message when present', () => {
      mockDb.queryOne.mockReturnValue({
        id: 'msg_summary',
        conversation_id: 'conv_123',
        role: 'system',
        content: 'Summary of earlier messages',
        timestamp: '2024-01-01T01:00:00Z',
        metadata: null,
        compacted_at: null,
        is_summary: 1,
        token_count: 100,
        is_pinned: 0,
      })
      mockDb.query.mockReturnValue([
        {
          id: 'msg_summary',
          conversation_id: 'conv_123',
          role: 'system',
          content: 'Summary of earlier messages',
          timestamp: '2024-01-01T01:00:00Z',
          metadata: null,
          compacted_at: null,
          is_summary: 1,
          token_count: 100,
          is_pinned: 0,
        },
        {
          id: 'msg_after',
          conversation_id: 'conv_123',
          role: 'user',
          content: 'After summary',
          timestamp: '2024-01-01T01:30:00Z',
          metadata: null,
          compacted_at: null,
          is_summary: 0,
          token_count: 5,
          is_pinned: 0,
        },
      ])

      const messages = store.getMessages('conv_123')

      // Should include summary and messages after
      expect(messages.some((m) => m.isSummary)).toBe(true)
    })
  })

  describe('search', () => {
    it('searches messages by content', () => {
      mockDb.query.mockReturnValue([
        {
          conversation_id: 'conv_123',
          conversation_title: 'Test Chat',
          message_id: 'msg_1',
          content: 'Hello world',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ])

      const results = store.search('hello')

      expect(results.length).toBe(1)
      expect(results[0]!.conversationId).toBe('conv_123')
      expect(results[0]!.content).toBe('Hello world')
    })
  })

  describe('export', () => {
    it('exports to JSON format', () => {
      mockDb.queryOne
        .mockReturnValueOnce({
          id: 'conv_123',
          title: 'Test Chat',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
          metadata: null,
        })
        .mockReturnValueOnce(null) // No summary

      mockDb.query.mockReturnValue([])

      const exported = store.export('conv_123', 'json')

      const parsed = JSON.parse(exported)
      expect(parsed.id).toBe('conv_123')
      expect(parsed.title).toBe('Test Chat')
    })

    it('exports to Markdown format', () => {
      mockDb.queryOne
        .mockReturnValueOnce({
          id: 'conv_123',
          title: 'Test Chat',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
          metadata: null,
        })
        .mockReturnValueOnce(null) // No summary

      mockDb.query.mockReturnValue([
        {
          id: 'msg_1',
          conversation_id: 'conv_123',
          role: 'user',
          content: 'Hello',
          timestamp: '2024-01-01T00:00:00Z',
          metadata: null,
          compacted_at: null,
          is_summary: 0,
          token_count: null,
          is_pinned: 0,
        },
      ])

      const exported = store.export('conv_123', 'md')

      expect(exported).toContain('# Test Chat')
      expect(exported).toContain('**User**')
      expect(exported).toContain('Hello')
    })

    it('throws for non-existent conversation', () => {
      mockDb.queryOne.mockReturnValue(null)

      expect(() => store.export('non-existent', 'json')).toThrow('Conversation not found')
    })
  })

  describe('pinMessage / unpinMessage / isPinned', () => {
    it('pins a message', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })
      mockDb.queryOne.mockReturnValue({ is_pinned: 1 })

      store.pinMessage('msg_1', 'conv_123')
      const isPinned = store.isPinned('msg_1', 'conv_123')

      expect(isPinned).toBe(true)
    })

    it('unpins a message', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })
      mockDb.queryOne.mockReturnValue({ is_pinned: 0 })

      store.unpinMessage('msg_1', 'conv_123')
      const isPinned = store.isPinned('msg_1', 'conv_123')

      expect(isPinned).toBe(false)
    })
  })

  describe('getConversationCount', () => {
    it('returns total conversation count', () => {
      mockDb.queryOne.mockReturnValue({ count: 42 })

      const count = store.getConversationCount()

      expect(count).toBe(42)
    })
  })

  describe('getMessageCount', () => {
    it('returns message count for conversation', () => {
      mockDb.queryOne.mockReturnValue({ count: 10 })

      const count = store.getMessageCount('conv_123')

      expect(count).toBe(10)
    })
  })
})

describe('getConversationStore', () => {
  it('returns singleton instance', () => {
    const instance1 = getConversationStore()
    const instance2 = getConversationStore()
    expect(instance1).toBe(instance2)
  })
})

describe('initializeConversationStore', () => {
  it('returns the singleton instance', async () => {
    const instance = await initializeConversationStore()
    expect(instance).toBe(getConversationStore())
  })
})
