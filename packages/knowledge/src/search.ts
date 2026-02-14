import { getDatabase } from '@wqbot/storage'
import { createModuleLogger } from '@wqbot/core'
import { deserializeEmbedding, type KnowledgeChunk } from './database.js'
import type { SearchResult } from './types.js'

const logger = createModuleLogger('knowledge-search')

export interface SearchOptions {
  readonly query: string
  readonly collectionId?: string | undefined
  readonly limit?: number | undefined
}

/**
 * FTS5 BM25 关键词检索
 */
function searchFts(options: SearchOptions): readonly { id: string; score: number }[] {
  const db = getDatabase()
  const limit = options.limit ?? 10

  let sql: string
  let params: unknown[]

  if (options.collectionId) {
    sql = `
      SELECT c.id, fts.rank
      FROM knowledge_fts fts
      JOIN knowledge_chunks c ON c.rowid = fts.rowid
      WHERE knowledge_fts MATCH ?
        AND c.collection_id = ?
      ORDER BY fts.rank
      LIMIT ?
    `
    params = [options.query, options.collectionId, limit]
  } else {
    sql = `
      SELECT c.id, fts.rank
      FROM knowledge_fts fts
      JOIN knowledge_chunks c ON c.rowid = fts.rowid
      WHERE knowledge_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `
    params = [options.query, limit]
  }

  try {
    const rows = db.query<{ id: string; rank: number }>(sql, params)
    // FTS5 rank 是负数（越小越好），转为正分数
    return rows.map((row) => ({
      id: row.id,
      score: -row.rank,
    }))
  } catch (error) {
    logger.error('FTS 检索失败:', error instanceof Error ? error : new Error(String(error)))
    return []
  }
}

/**
 * 余弦相似度
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0
  return dotProduct / denominator
}

/**
 * 向量余弦相似度检索
 */
function searchVector(
  queryEmbedding: Float32Array,
  chunks: readonly KnowledgeChunk[],
  limit: number
): readonly { id: string; score: number }[] {
  const scored = chunks
    .filter((chunk) => chunk.embedding !== null)
    .map((chunk) => {
      const embedding = deserializeEmbedding(chunk.embedding as Buffer)
      return {
        id: chunk.id,
        score: cosineSimilarity(queryEmbedding, embedding),
      }
    })
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, limit)
}

/**
 * RRF (Reciprocal Rank Fusion) 混合排序
 * 将多个排序列表合并为一个
 */
export function rrfFusion(
  lists: readonly (readonly { id: string; score: number }[])[],
  k: number = 60
): readonly { id: string; score: number }[] {
  const scores = new Map<string, number>()

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank]!
      const current = scores.get(item.id) ?? 0
      scores.set(item.id, current + 1 / (k + rank + 1))
    }
  }

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}

/**
 * 混合检索：FTS5 + 可选向量检索 + RRF 融合
 */
export function search(
  options: SearchOptions,
  queryEmbedding?: Float32Array,
  embeddingChunks?: readonly KnowledgeChunk[]
): readonly SearchResult[] {
  const limit = options.limit ?? 5
  const fetchLimit = limit * 3 // 多取一些用于融合

  // FTS5 检索
  const ftsResults = searchFts({ ...options, limit: fetchLimit })

  // 向量检索（如果有 embedding）
  const lists: (readonly { id: string; score: number }[])[] = [ftsResults]

  if (queryEmbedding && embeddingChunks && embeddingChunks.length > 0) {
    const vectorResults = searchVector(queryEmbedding, embeddingChunks, fetchLimit)
    lists.push(vectorResults)
  }

  // RRF 融合
  const fused = lists.length > 1 ? rrfFusion(lists) : ftsResults

  // 取 top-N 并填充完整信息
  const topIds = fused.slice(0, limit)
  if (topIds.length === 0) return []

  const db = getDatabase()
  const results: SearchResult[] = []

  for (const item of topIds) {
    const row = db.queryOne<{
      id: string
      content: string
      source_file: string | null
      source_title: string | null
      collection_id: string
    }>('SELECT id, content, source_file, source_title, collection_id FROM knowledge_chunks WHERE id = ?', [item.id])

    if (!row) continue

    const collection = db.queryOne<{ name: string }>(
      'SELECT name FROM knowledge_collections WHERE id = ?',
      [row.collection_id]
    )

    results.push({
      id: row.id,
      content: row.content,
      sourceFile: row.source_file,
      sourceTitle: row.source_title,
      collectionName: collection?.name ?? 'unknown',
      score: item.score,
    })
  }

  return results
}
