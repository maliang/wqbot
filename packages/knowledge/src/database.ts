import { getDatabase } from '@wqbot/storage'
import { createModuleLogger, generateId } from '@wqbot/core'

const logger = createModuleLogger('knowledge-db')

// 类型定义
export interface KnowledgeCollection {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly source_dir: string | null
  readonly created_at: string
  readonly updated_at: string
}

export interface KnowledgeChunk {
  readonly id: string
  readonly collection_id: string
  readonly content: string
  readonly source_file: string | null
  readonly source_title: string | null
  readonly chunk_index: number
  readonly embedding: Buffer | null
  readonly metadata: string | null
  readonly created_at: string
}

export interface CreateCollectionInput {
  readonly name: string
  readonly description?: string | undefined
  readonly sourceDir?: string | undefined
}

export interface CreateChunkInput {
  readonly collectionId: string
  readonly content: string
  readonly sourceFile?: string | undefined
  readonly sourceTitle?: string | undefined
  readonly chunkIndex: number
  readonly embedding?: Float32Array | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

/**
 * Float32Array → Buffer 序列化
 */
export function serializeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)
}

/**
 * Buffer → Float32Array 反序列化
 */
export function deserializeEmbedding(buffer: Buffer): Float32Array {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return new Float32Array(arrayBuffer)
}

export class KnowledgeDB {
  /**
   * 运行知识库相关的 migration
   */
  runMigrations(): void {
    const db = getDatabase()
    const rawDb = db.getDb()

    // 检查已应用的 migration
    const appliedRows = rawDb.prepare('SELECT name FROM migrations').all() as Array<{ name: string }>
    const applied = new Set(appliedRows.map((row) => row.name))
    const insertMigration = rawDb.prepare('INSERT INTO migrations (name) VALUES (?)')

    const migrations = [
      {
        name: '007_create_knowledge_collections',
        sql: `
          CREATE TABLE IF NOT EXISTS knowledge_collections (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT DEFAULT '',
            source_dir TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `,
      },
      {
        name: '008_create_knowledge_chunks',
        sql: `
          CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id TEXT PRIMARY KEY,
            collection_id TEXT NOT NULL,
            content TEXT NOT NULL,
            source_file TEXT,
            source_title TEXT,
            chunk_index INTEGER NOT NULL DEFAULT 0,
            embedding BLOB,
            metadata TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (collection_id) REFERENCES knowledge_collections(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_chunks_collection ON knowledge_chunks(collection_id);
          CREATE INDEX IF NOT EXISTS idx_chunks_source ON knowledge_chunks(source_file);
        `,
      },
      {
        name: '009_create_knowledge_fts',
        sql: `
          CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
            content,
            content='knowledge_chunks',
            content_rowid='rowid',
            tokenize='unicode61'
          );
          CREATE TRIGGER IF NOT EXISTS knowledge_fts_insert AFTER INSERT ON knowledge_chunks BEGIN
            INSERT INTO knowledge_fts(rowid, content) VALUES (new.rowid, new.content);
          END;
          CREATE TRIGGER IF NOT EXISTS knowledge_fts_delete AFTER DELETE ON knowledge_chunks BEGIN
            INSERT INTO knowledge_fts(knowledge_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
          END;
          CREATE TRIGGER IF NOT EXISTS knowledge_fts_update AFTER UPDATE ON knowledge_chunks BEGIN
            INSERT INTO knowledge_fts(knowledge_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
            INSERT INTO knowledge_fts(rowid, content) VALUES (new.rowid, new.content);
          END;
        `,
      },
    ]

    for (const migration of migrations) {
      if (!applied.has(migration.name)) {
        logger.debug(`应用 migration: ${migration.name}`)
        rawDb.exec(migration.sql)
        insertMigration.run(migration.name)
      }
    }
  }

  // ── Collection CRUD ──

  createCollection(input: CreateCollectionInput): KnowledgeCollection {
    const db = getDatabase()
    const id = generateId()
    db.run(
      'INSERT INTO knowledge_collections (id, name, description, source_dir) VALUES (?, ?, ?, ?)',
      [id, input.name, input.description ?? '', input.sourceDir ?? null]
    )
    return db.queryOne<KnowledgeCollection>('SELECT * FROM knowledge_collections WHERE id = ?', [id])!
  }

  getCollection(name: string): KnowledgeCollection | undefined {
    const db = getDatabase()
    return db.queryOne<KnowledgeCollection>('SELECT * FROM knowledge_collections WHERE name = ?', [name])
  }

  getCollectionById(id: string): KnowledgeCollection | undefined {
    const db = getDatabase()
    return db.queryOne<KnowledgeCollection>('SELECT * FROM knowledge_collections WHERE id = ?', [id])
  }

  listCollections(): readonly KnowledgeCollection[] {
    const db = getDatabase()
    return db.query<KnowledgeCollection>('SELECT * FROM knowledge_collections ORDER BY created_at DESC')
  }

  deleteCollection(name: string): boolean {
    const db = getDatabase()
    const result = db.run('DELETE FROM knowledge_collections WHERE name = ?', [name])
    return result.changes > 0
  }

  getCollectionStats(): readonly { name: string; chunkCount: number }[] {
    const db = getDatabase()
    return db.query<{ name: string; chunkCount: number }>(
      `SELECT c.name, COUNT(ch.id) as chunkCount
       FROM knowledge_collections c
       LEFT JOIN knowledge_chunks ch ON ch.collection_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    )
  }

  // ── Chunk CRUD ──

  addChunk(input: CreateChunkInput): KnowledgeChunk {
    const db = getDatabase()
    const id = generateId()
    const embeddingBlob = input.embedding ? serializeEmbedding(input.embedding) : null
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null

    db.run(
      `INSERT INTO knowledge_chunks (id, collection_id, content, source_file, source_title, chunk_index, embedding, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.collectionId, input.content, input.sourceFile ?? null, input.sourceTitle ?? null, input.chunkIndex, embeddingBlob, metadataJson]
    )
    return db.queryOne<KnowledgeChunk>('SELECT * FROM knowledge_chunks WHERE id = ?', [id])!
  }

  addChunks(inputs: readonly CreateChunkInput[]): void {
    const db = getDatabase()
    db.transaction(() => {
      for (const input of inputs) {
        const id = generateId()
        const embeddingBlob = input.embedding ? serializeEmbedding(input.embedding) : null
        const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null
        db.run(
          `INSERT INTO knowledge_chunks (id, collection_id, content, source_file, source_title, chunk_index, embedding, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, input.collectionId, input.content, input.sourceFile ?? null, input.sourceTitle ?? null, input.chunkIndex, embeddingBlob, metadataJson]
        )
      }
    })
  }

  getChunksByCollection(collectionId: string): readonly KnowledgeChunk[] {
    const db = getDatabase()
    return db.query<KnowledgeChunk>(
      'SELECT * FROM knowledge_chunks WHERE collection_id = ? ORDER BY chunk_index',
      [collectionId]
    )
  }

  getChunksBySourceFile(sourceFile: string): readonly KnowledgeChunk[] {
    const db = getDatabase()
    return db.query<KnowledgeChunk>(
      'SELECT * FROM knowledge_chunks WHERE source_file = ? ORDER BY chunk_index',
      [sourceFile]
    )
  }

  deleteChunksBySourceFile(sourceFile: string): number {
    const db = getDatabase()
    const result = db.run('DELETE FROM knowledge_chunks WHERE source_file = ?', [sourceFile])
    return result.changes
  }

  deleteChunksByCollection(collectionId: string): number {
    const db = getDatabase()
    const result = db.run('DELETE FROM knowledge_chunks WHERE collection_id = ?', [collectionId])
    return result.changes
  }

  deleteDocument(id: string): boolean {
    const db = getDatabase()
    const result = db.run('DELETE FROM knowledge_chunks WHERE id = ?', [id])
    return result.changes > 0
  }

  /**
   * 获取所有带 embedding 的 chunk（用于向量检索）
   */
  getChunksWithEmbedding(collectionId?: string): readonly KnowledgeChunk[] {
    const db = getDatabase()
    if (collectionId) {
      return db.query<KnowledgeChunk>(
        'SELECT * FROM knowledge_chunks WHERE embedding IS NOT NULL AND collection_id = ?',
        [collectionId]
      )
    }
    return db.query<KnowledgeChunk>('SELECT * FROM knowledge_chunks WHERE embedding IS NOT NULL')
  }

  /**
   * 更新 chunk 的 embedding
   */
  updateEmbedding(chunkId: string, embedding: Float32Array): void {
    const db = getDatabase()
    db.run('UPDATE knowledge_chunks SET embedding = ? WHERE id = ?', [serializeEmbedding(embedding), chunkId])
  }

  /**
   * 获取没有 embedding 的 chunk
   */
  getChunksWithoutEmbedding(limit: number = 100): readonly KnowledgeChunk[] {
    const db = getDatabase()
    return db.query<KnowledgeChunk>(
      'SELECT * FROM knowledge_chunks WHERE embedding IS NULL LIMIT ?',
      [limit]
    )
  }

  /**
   * 重建 FTS 索引
   */
  rebuildFtsIndex(): void {
    const db = getDatabase()
    const rawDb = db.getDb()
    rawDb.exec("INSERT INTO knowledge_fts(knowledge_fts) VALUES ('rebuild')")
    logger.info('FTS 索引已重建')
  }
}

// 单例
let knowledgeDBInstance: KnowledgeDB | null = null

export function getKnowledgeDB(): KnowledgeDB {
  if (!knowledgeDBInstance) {
    knowledgeDBInstance = new KnowledgeDB()
  }
  return knowledgeDBInstance
}
