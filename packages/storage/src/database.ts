import initSqlJs from 'sql.js'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { getConfigManager, createModuleLogger } from '@wqbot/core'

// Type definitions for sql.js
interface SqlJsDatabase {
  run(sql: string, params?: SqlValue[]): SqlJsDatabase
  exec(sql: string, params?: SqlValue[]): QueryExecResult[]
  export(): Uint8Array
  close(): void
}

interface QueryExecResult {
  columns: string[]
  values: SqlValue[][]
}

type SqlValue = string | number | Uint8Array | null

const logger = createModuleLogger('database')

export class DatabaseWrapper {
  private db: SqlJsDatabase | null = null
  private readonly dbPath: string
  private saveTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(dbPath?: string) {
    const config = getConfigManager()
    this.dbPath = dbPath ?? path.join(config.getDataDir(), 'wqbot.db')
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }

    // Initialize sql.js
    const SQL = await initSqlJs()

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = await fs.promises.readFile(this.dbPath)
      this.db = new SQL.Database(buffer)
    } else {
      this.db = new SQL.Database()
    }

    // Run migrations
    await this.runMigrations()

    // Save initial state
    await this.save()

    logger.info('Database initialized', { path: this.dbPath })
  }

  private async runMigrations(): Promise<void> {
    const db = this.getDb()

    // Create migrations table
    db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // Get applied migrations
    const appliedResult = db.exec('SELECT name FROM migrations')
    const applied = new Set(
      appliedResult.length > 0 ? appliedResult[0]!.values.map((row) => row[0] as string) : []
    )

    // Define migrations
    const migrations: Array<{ name: string; sql: string }> = [
      {
        name: '001_create_conversations',
        sql: `
          CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            metadata TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
        `,
      },
      {
        name: '002_create_messages',
        sql: `
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            metadata TEXT,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
          CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        `,
      },
      {
        name: '003_create_settings',
        sql: `
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `,
      },
      {
        name: '004_create_audit_log',
        sql: `
          CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            action TEXT NOT NULL,
            skill_name TEXT,
            user_id TEXT,
            details TEXT,
            success INTEGER NOT NULL DEFAULT 1
          );
          CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
          CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
        `,
      },
      {
        name: '005_create_skill_permissions',
        sql: `
          CREATE TABLE IF NOT EXISTS skill_permissions (
            skill_name TEXT NOT NULL,
            permission TEXT NOT NULL,
            granted_at TEXT NOT NULL DEFAULT (datetime('now')),
            granted_by TEXT,
            PRIMARY KEY (skill_name, permission)
          );
        `,
      },
    ]

    // Apply pending migrations
    for (const migration of migrations) {
      if (!applied.has(migration.name)) {
        logger.debug(`Applying migration: ${migration.name}`)
        db.run(migration.sql)
        db.run('INSERT INTO migrations (name) VALUES (?)', [migration.name])
      }
    }

    await this.save()
  }

  getDb(): SqlJsDatabase {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return this.db
  }

  private async save(): Promise<void> {
    if (!this.db) return

    const data = this.db.export()
    const buffer = Buffer.from(data)
    await fs.promises.writeFile(this.dbPath, buffer)
  }

  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
    this.saveTimeout = setTimeout(() => {
      this.save().catch((err) => {
        logger.error('Failed to save database', err instanceof Error ? err : undefined)
      })
    }, 100)
  }

  close(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
    if (this.db) {
      // Save before closing
      this.save().catch(() => {})
      this.db.close()
      this.db = null
      logger.debug('Database closed')
    }
  }

  /**
   * Run a query and return all results
   */
  query<T>(sql: string, params: unknown[] = []): T[] {
    const db = this.getDb()
    const result = db.exec(sql, params as (string | number | null | Uint8Array)[])

    if (result.length === 0) {
      return []
    }

    const columns = result[0]!.columns
    return result[0]!.values.map((row) => {
      const obj: Record<string, unknown> = {}
      columns.forEach((col, i) => {
        obj[col] = row[i]
      })
      return obj as T
    })
  }

  /**
   * Run a query and return the first result
   */
  queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
    const results = this.query<T>(sql, params)
    return results[0]
  }

  /**
   * Run an insert/update/delete statement
   */
  run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } {
    const db = this.getDb()
    db.run(sql, params as (string | number | null | Uint8Array)[])
    this.scheduleSave()

    // Get changes and last insert rowid
    const changesResult = db.exec('SELECT changes() as changes, last_insert_rowid() as lastId')
    const changes = changesResult[0]?.values[0]?.[0] as number ?? 0
    const lastInsertRowid = changesResult[0]?.values[0]?.[1] as number ?? 0

    return { changes, lastInsertRowid }
  }

  /**
   * Run multiple statements in a transaction
   */
  transaction<T>(fn: () => T): T {
    const db = this.getDb()
    db.run('BEGIN TRANSACTION')
    try {
      const result = fn()
      db.run('COMMIT')
      this.scheduleSave()
      return result
    } catch (error) {
      db.run('ROLLBACK')
      throw error
    }
  }
}

// Singleton instance
let databaseInstance: DatabaseWrapper | null = null

export function getDatabase(): DatabaseWrapper {
  if (!databaseInstance) {
    databaseInstance = new DatabaseWrapper()
  }
  return databaseInstance
}

export async function initializeDatabase(): Promise<DatabaseWrapper> {
  const db = getDatabase()
  await db.initialize()
  return db
}

// Re-export as Database for convenience
export { DatabaseWrapper as Database }
