import { z } from 'zod'
import { getDatabase } from './database.js'
import { createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('settings-store')

// Settings schema for validation
const SettingsSchema = z.object({
  // User preferences
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().optional(),

  // Model preferences
  defaultModel: z.string().optional(),
  routingStrategy: z.enum(['quality', 'balanced', 'economy']).optional(),
  localOnly: z.boolean().optional(),

  // UI preferences
  showTimestamps: z.boolean().optional(),
  compactMode: z.boolean().optional(),
  fontSize: z.enum(['small', 'medium', 'large']).optional(),

  // Privacy
  saveHistory: z.boolean().optional(),
  analyticsEnabled: z.boolean().optional(),

  // Advanced
  maxContextMessages: z.number().int().positive().optional(),
  streamResponses: z.boolean().optional(),
})

export type Settings = z.infer<typeof SettingsSchema>

interface SettingRow {
  key: string
  value: string
  updated_at: string
}

export class SettingsStore {
  private cache: Map<string, unknown> = new Map()

  /**
   * Get a setting value
   */
  get<K extends keyof Settings>(key: K): Settings[K] | undefined {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key) as Settings[K]
    }

    const db = getDatabase()
    const row = db.queryOne<SettingRow>('SELECT * FROM settings WHERE key = ?', [key])

    if (!row) {
      return undefined
    }

    const value = JSON.parse(row.value) as Settings[K]
    this.cache.set(key, value)
    return value
  }

  /**
   * Set a setting value
   */
  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    const jsonValue = JSON.stringify(value)

    db.run(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
      [key, jsonValue, now, jsonValue, now]
    )

    this.cache.set(key, value)
    logger.debug('Setting updated', { key })
  }

  /**
   * Delete a setting
   */
  delete<K extends keyof Settings>(key: K): void {
    const db = getDatabase()
    db.run('DELETE FROM settings WHERE key = ?', [key])
    this.cache.delete(key)
    logger.debug('Setting deleted', { key })
  }

  /**
   * Get all settings
   */
  getAll(): Settings {
    const db = getDatabase()
    const rows = db.query<SettingRow>('SELECT * FROM settings')

    const settings: Record<string, unknown> = {}
    for (const row of rows) {
      settings[row.key] = JSON.parse(row.value)
      this.cache.set(row.key, settings[row.key])
    }

    return settings as Settings
  }

  /**
   * Set multiple settings at once
   */
  setMany(settings: Partial<Settings>): void {
    const db = getDatabase()
    const now = new Date().toISOString()

    db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        if (value !== undefined) {
          const jsonValue = JSON.stringify(value)
          db.run(
            `INSERT INTO settings (key, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?`,
            [key, jsonValue, now, jsonValue, now]
          )
          this.cache.set(key, value)
        }
      }
    })

    logger.debug('Multiple settings updated', { keys: Object.keys(settings) })
  }

  /**
   * Reset all settings to defaults
   */
  reset(): void {
    const db = getDatabase()
    db.run('DELETE FROM settings')
    this.cache.clear()
    logger.info('All settings reset')
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Export settings to JSON
   */
  export(): string {
    return JSON.stringify(this.getAll(), null, 2)
  }

  /**
   * Import settings from JSON
   */
  import(json: string): void {
    const parsed = JSON.parse(json) as unknown
    const validated = SettingsSchema.parse(parsed)
    this.setMany(validated)
    logger.info('Settings imported')
  }
}

// Singleton instance
let storeInstance: SettingsStore | null = null

export function getSettingsStore(): SettingsStore {
  if (!storeInstance) {
    storeInstance = new SettingsStore()
  }
  return storeInstance
}

export async function initializeSettingsStore(): Promise<SettingsStore> {
  return getSettingsStore()
}
