import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
}))

import { SettingsStore, getSettingsStore, initializeSettingsStore } from '../src/settings.js'

describe('SettingsStore', () => {
  let store: SettingsStore

  beforeEach(() => {
    vi.clearAllMocks()
    store = new SettingsStore()
  })

  afterEach(() => {
    store.clearCache()
  })

  describe('get', () => {
    it('returns undefined for unset setting', () => {
      mockDb.queryOne.mockReturnValue(null)

      const value = store.get('theme')

      expect(value).toBeUndefined()
    })

    it('returns cached value without database query', () => {
      // Set cache manually
      ;(store as unknown as { cache: Map<string, unknown> }).cache.set('theme', 'dark')

      const value = store.get('theme')

      expect(value).toBe('dark')
      expect(mockDb.queryOne).not.toHaveBeenCalled()
    })

    it('parses JSON from database', () => {
      mockDb.queryOne.mockReturnValue({
        key: 'theme',
        value: '"dark"',
        updated_at: '2024-01-01T00:00:00Z',
      })

      const value = store.get('theme')

      expect(value).toBe('dark')
    })
  })

  describe('set', () => {
    it('sets a setting value', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })

      store.set('theme', 'dark')

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings'),
        expect.arrayContaining(['theme', '"dark"'])
      )
    })

    it('updates cache', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })

      store.set('theme', 'dark')

      expect(store.get('theme')).toBe('dark')
    })

    it('updates existing setting', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })

      store.set('theme', 'light')
      store.set('theme', 'dark')

      expect(mockDb.run).toHaveBeenCalledTimes(2)
    })
  })

  describe('delete', () => {
    it('deletes a setting', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })

      store.delete('theme')

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM settings'),
        ['theme']
      )
    })

    it('removes from cache', () => {
      ;(store as unknown as { cache: Map<string, unknown> }).cache.set('theme', 'dark')
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })
      mockDb.queryOne.mockReturnValue(null) // After delete, database returns null

      store.delete('theme')

      expect(store.get('theme')).toBeUndefined()
    })
  })

  describe('getAll', () => {
    it('returns all settings', () => {
      mockDb.query.mockReturnValue([
        { key: 'theme', value: '"dark"', updated_at: '2024-01-01T00:00:00Z' },
        { key: 'language', value: '"en"', updated_at: '2024-01-01T00:00:00Z' },
      ])

      const settings = store.getAll()

      expect(settings.theme).toBe('dark')
      expect(settings.language).toBe('en')
    })

    it('returns empty object when no settings', () => {
      mockDb.query.mockReturnValue([])

      const settings = store.getAll()

      expect(Object.keys(settings).length).toBe(0)
    })
  })

  describe('setMany', () => {
    it('sets multiple settings at once', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })

      store.setMany({
        theme: 'dark',
        language: 'en',
        showTimestamps: true,
      })

      expect(mockDb.transaction).toHaveBeenCalled()
    })
  })

  describe('reset', () => {
    it('deletes all settings', () => {
      mockDb.run.mockReturnValue({ changes: 5, lastInsertRowid: 0 })

      store.reset()

      expect(mockDb.run).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM settings'))
    })

    it('clears cache', () => {
      ;(store as unknown as { cache: Map<string, unknown> }).cache.set('theme', 'dark')
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })

      store.reset()

      expect((store as unknown as { cache: Map<string, unknown> }).cache.size).toBe(0)
    })
  })

  describe('clearCache', () => {
    it('clears the cache', () => {
      ;(store as unknown as { cache: Map<string, unknown> }).cache.set('theme', 'dark')

      store.clearCache()

      expect((store as unknown as { cache: Map<string, unknown> }).cache.size).toBe(0)
    })
  })

  describe('export', () => {
    it('exports settings to JSON', () => {
      mockDb.query.mockReturnValue([
        { key: 'theme', value: '"dark"', updated_at: '2024-01-01T00:00:00Z' },
      ])

      const json = store.export()
      const parsed = JSON.parse(json)

      expect(parsed.theme).toBe('dark')
    })
  })

  describe('import', () => {
    it('imports settings from JSON', () => {
      mockDb.run.mockReturnValue({ changes: 1, lastInsertRowid: 0 })

      const json = JSON.stringify({ theme: 'dark', language: 'en' })
      store.import(json)

      // Uses transaction internally
      expect(mockDb.transaction).toHaveBeenCalled()
    })

    it('validates settings schema', () => {
      const invalidJson = JSON.stringify({ invalidKey: 'value' })

      // Zod should parse successfully but the invalid key is stripped
      // The schema only validates known keys, unknown keys are silently ignored
      expect(() => store.import(invalidJson)).not.toThrow()
    })
  })

  describe('setting types', () => {
    it('handles boolean values', () => {
      mockDb.queryOne.mockReturnValue({
        key: 'showTimestamps',
        value: 'true',
        updated_at: '2024-01-01T00:00:00Z',
      })

      const value = store.get('showTimestamps')

      expect(value).toBe(true)
    })

    it('handles number values', () => {
      mockDb.queryOne.mockReturnValue({
        key: 'maxContextMessages',
        value: '50',
        updated_at: '2024-01-01T00:00:00Z',
      })

      const value = store.get('maxContextMessages')

      expect(value).toBe(50)
    })

    it('handles enum values', () => {
      mockDb.queryOne.mockReturnValue({
        key: 'fontSize',
        value: '"medium"',
        updated_at: '2024-01-01T00:00:00Z',
      })

      const value = store.get('fontSize')

      expect(value).toBe('medium')
    })
  })
})

describe('getSettingsStore', () => {
  it('returns singleton instance', () => {
    const instance1 = getSettingsStore()
    const instance2 = getSettingsStore()
    expect(instance1).toBe(instance2)
  })
})

describe('initializeSettingsStore', () => {
  it('returns the singleton instance', async () => {
    const instance = await initializeSettingsStore()
    expect(instance).toBe(getSettingsStore())
  })
})
