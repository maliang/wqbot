import { Database as BunDatabase } from 'bun:sqlite'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { getConfigManager, createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('database')

export class DatabaseWrapper {
  private db: BunDatabase | null = null
  private readonly dbPath: string

  constructor(dbPath?: string) {
    const config = getConfigManager()
    this.dbPath = dbPath ?? path.join(config.getDataDir(), 'wqbot.db')
  }

  async initialize(): Promise<void> {
    // 确保目录存在
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new BunDatabase(this.dbPath)

    // 启用 WAL 模式提升并发性能
    this.db.exec('PRAGMA journal_mode=WAL')
    this.db.exec('PRAGMA foreign_keys=ON')

    this.runMigrations()

    logger.info('Database initialized', { path: this.dbPath })
  }

  private runMigrations(): void {
    const db = this.getDb()

    // 创建 migrations 表
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // 获取已应用的 migrations
    const appliedRows = db.prepare('SELECT name FROM migrations').all() as Array<{ name: string }>
    const applied = new Set(appliedRows.map((row) => row.name))

    // 定义 migrations
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
      {
        name: '006_add_token_fields',
        sql: `
          ALTER TABLE messages ADD COLUMN compacted_at TEXT;
          ALTER TABLE messages ADD COLUMN is_summary INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE messages ADD COLUMN token_count INTEGER;
        `,
      },
      {
        name: '007_add_pinned_field',
        sql: `
          ALTER TABLE messages ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
        `,
      },
    ]

    // 应用待执行的 migrations
    const insertMigration = db.prepare('INSERT INTO migrations (name) VALUES (?)')
    for (const migration of migrations) {
      if (!applied.has(migration.name)) {
        logger.debug(`Applying migration: ${migration.name}`)
        db.exec(migration.sql)
        insertMigration.run(migration.name)
      }
    }
  }

  getDb(): BunDatabase {
    if (!this.db) {
      throw new Error('Database not initialized')
    }
    return this.db
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      logger.debug('Database closed')
    }
  }

  /**
   * 执行查询并返回所有结果
   */
  query<T>(sql: string, params: unknown[] = []): T[] {
    const db = this.getDb()
    return db.prepare(sql).all(...params) as T[]
  }

  /**
   * 执行查询并返回第一条结果
   */
  queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
    const db = this.getDb()
    return db.prepare(sql).get(...params) as T | undefined
  }

  /**
   * 执行 insert/update/delete 语句
   */
  run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number } {
    const db = this.getDb()
    const result = db.prepare(sql).run(...params)
    return {
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    }
  }

  /**
   * 在事务中执行多条语句
   */
  transaction<T>(fn: () => T): T {
    const db = this.getDb()
    const tx = db.transaction(fn)
    return tx()
  }
}

// 单例
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

export { DatabaseWrapper as Database }
