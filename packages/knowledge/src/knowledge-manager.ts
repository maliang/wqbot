import { createModuleLogger, getConfigManager } from '@wqbot/core'
import { getKnowledgeDB, type KnowledgeCollection } from './database.js'
import { chunkDocument } from './chunker.js'
import { embedText, embedTexts, getEmbedderConfig, type EmbedderConfig } from './embedder.js'
import { search } from './search.js'
import { importDirectory, reindexFile } from './importer.js'
import type { KnowledgeConfig, SearchResult } from './types.js'

const logger = createModuleLogger('knowledge-manager')

export class KnowledgeManager {
  private config: KnowledgeConfig = {}
  private embedderConfig: EmbedderConfig | null = null
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    const db = getKnowledgeDB()
    db.runMigrations()

    await this.loadConfig()
    this.initialized = true

    if (this.config.enabled) {
      await this.indexConfiguredCollections()
    }

    logger.info('知识库已初始化', { enabled: this.config.enabled ?? false })
  }

  private async loadConfig(): Promise<void> {
    const configManager = getConfigManager()
    const appConfig = configManager.getConfig() as Record<string, unknown>
    this.config = (appConfig.knowledge as KnowledgeConfig) ?? {}
    this.embedderConfig = this.config.embedding ? getEmbedderConfig(this.config) : null
  }

  /**
   * 索引配置中定义的所有集合
   */
  private async indexConfiguredCollections(): Promise<void> {
    const collections = this.config.collections ?? []
    const db = getKnowledgeDB()

    for (const collConf of collections) {
      // 确保集合存在
      let collection = db.getCollection(collConf.name)
      if (!collection) {
        collection = db.createCollection({
          name: collConf.name,
          description: `自动创建的集合: ${collConf.name}`,
        })
      }

      // 导入每个目录
      for (const dir of collConf.dirs) {
        try {
          await importDirectory(dir, {
            collectionId: collection.id,
            chunkerOptions: {
              chunkSize: this.config.chunkSize,
              chunkOverlap: this.config.chunkOverlap,
            },
            embedderConfig: this.embedderConfig,
          })
        } catch (error) {
          logger.error(`导入目录失败: ${dir}`, error instanceof Error ? error : new Error(String(error)))
        }
      }
    }
  }

  /**
   * 搜索知识库
   */
  async search(query: string, collectionName?: string, limit: number = 5): Promise<readonly SearchResult[]> {
    const db = getKnowledgeDB()

    let collectionId: string | undefined
    if (collectionName) {
      const collection = db.getCollection(collectionName)
      if (!collection) return []
      collectionId = collection.id
    }

    // 生成查询向量（如果配置了 embedding）
    let queryEmbedding: Float32Array | undefined
    let embeddingChunks: ReturnType<typeof db.getChunksWithEmbedding> | undefined

    if (this.embedderConfig) {
      try {
        queryEmbedding = await embedText(query, this.embedderConfig)
        embeddingChunks = db.getChunksWithEmbedding(collectionId)
      } catch (error) {
        logger.warn('查询 embedding 生成失败，回退纯 FTS', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return search({ query, collectionId, limit }, queryEmbedding, embeddingChunks)
  }

  /**
   * 添加文本到知识库
   */
  async addText(content: string, collectionName: string = 'default', title?: string): Promise<number> {
    const db = getKnowledgeDB()

    // 确保集合存在
    let collection = db.getCollection(collectionName)
    if (!collection) {
      collection = db.createCollection({ name: collectionName })
    }

    const chunks = chunkDocument(content, {
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
    }, title)

    if (chunks.length === 0) return 0

    // 生成 embedding
    let embeddings: readonly Float32Array[] | null = null
    if (this.embedderConfig) {
      try {
        embeddings = await embedTexts(
          chunks.map((c) => c.content),
          this.embedderConfig
        )
      } catch (error) {
        logger.warn('embedding 生成失败，仅使用 FTS', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    db.addChunks(
      chunks.map((chunk, i) => ({
        collectionId: collection.id,
        content: chunk.content,
        sourceTitle: chunk.sourceTitle,
        chunkIndex: chunk.chunkIndex,
        embedding: embeddings?.[i] ?? undefined,
      }))
    )

    return chunks.length
  }

  /**
   * 添加文档文件
   */
  async addDocument(filePath: string, collectionName: string = 'default'): Promise<number> {
    const db = getKnowledgeDB()

    let collection = db.getCollection(collectionName)
    if (!collection) {
      collection = db.createCollection({ name: collectionName })
    }

    return reindexFile(filePath, {
      collectionId: collection.id,
      chunkerOptions: {
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
      },
      embedderConfig: this.embedderConfig,
    })
  }

  /**
   * 删除文档
   */
  removeDocument(documentId: string): boolean {
    return getKnowledgeDB().deleteDocument(documentId)
  }

  /**
   * 列出所有集合及统计
   */
  listCollections(): readonly { name: string; chunkCount: number }[] {
    return getKnowledgeDB().getCollectionStats()
  }

  /**
   * 创建集合
   */
  createCollection(name: string, description?: string): KnowledgeCollection {
    return getKnowledgeDB().createCollection({ name, description })
  }

  /**
   * 删除集合
   */
  deleteCollection(name: string): boolean {
    return getKnowledgeDB().deleteCollection(name)
  }

  /**
   * 重新索引所有集合
   */
  async reindex(): Promise<void> {
    getKnowledgeDB().rebuildFtsIndex()
    await this.indexConfiguredCollections()
    logger.info('知识库重新索引完成')
  }

  /**
   * 重新索引单个文件
   */
  async reindexFile(filePath: string): Promise<void> {
    const db = getKnowledgeDB()
    const chunks = db.getChunksBySourceFile(filePath)
    if (chunks.length === 0) return

    const firstChunk = chunks[0]!
    await reindexFile(filePath, {
      collectionId: firstChunk.collection_id,
      chunkerOptions: {
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
      },
      embedderConfig: this.embedderConfig,
    })
  }

  /**
   * 重新加载配置
   */
  async reload(): Promise<void> {
    await this.loadConfig()
    if (this.config.enabled) {
      await this.indexConfiguredCollections()
    }
    logger.info('知识库配置已重新加载')
  }

  isEnabled(): boolean {
    return this.config.enabled ?? false
  }
}

// 单例
let managerInstance: KnowledgeManager | null = null

export function getKnowledgeManager(): KnowledgeManager {
  if (!managerInstance) {
    managerInstance = new KnowledgeManager()
  }
  return managerInstance
}

export async function initializeKnowledge(): Promise<KnowledgeManager> {
  const manager = getKnowledgeManager()
  await manager.initialize()
  return manager
}
