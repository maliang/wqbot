import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createModuleLogger } from '@wqbot/core'
import { chunkDocument, type ChunkerOptions } from './chunker.js'
import { getKnowledgeDB, type CreateChunkInput } from './database.js'
import { embedTexts, type EmbedderConfig } from './embedder.js'

const logger = createModuleLogger('knowledge-importer')

export interface ImportOptions {
  readonly collectionId: string
  readonly chunkerOptions?: ChunkerOptions | undefined
  readonly embedderConfig?: EmbedderConfig | null | undefined
}

export interface ImportResult {
  readonly filesProcessed: number
  readonly chunksCreated: number
  readonly filesSkipped: number
}

/**
 * 解析路径中的 ~ 为用户目录
 */
function resolvePath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1))
  }
  return path.resolve(p)
}

/**
 * 扫描目录中的 .md / .txt 文件
 */
async function scanFiles(dir: string): Promise<readonly string[]> {
  const resolved = resolvePath(dir)
  const files: string[] = []

  try {
    const entries = await fs.readdir(resolved, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(resolved, entry.name)
      if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) {
        files.push(fullPath)
      } else if (entry.isDirectory()) {
        const subFiles = await scanFiles(fullPath)
        files.push(...subFiles)
      }
    }
  } catch (error) {
    logger.warn(`扫描目录失败: ${dir}`, { error: error instanceof Error ? error.message : String(error) })
  }

  return files
}

/**
 * 从文件名提取标题
 */
function extractTitle(filePath: string): string {
  return path.basename(filePath, path.extname(filePath))
}

/**
 * 导入单个文件
 */
async function importFile(
  filePath: string,
  options: ImportOptions
): Promise<number> {
  const db = getKnowledgeDB()
  const content = await fs.readFile(filePath, 'utf-8')

  if (!content.trim()) return 0

  const title = extractTitle(filePath)
  const chunks = chunkDocument(content, options.chunkerOptions, title)

  if (chunks.length === 0) return 0

  // 生成 embedding（如果配置了）
  let embeddings: readonly Float32Array[] | null = null
  if (options.embedderConfig) {
    try {
      embeddings = await embedTexts(
        chunks.map((c) => c.content),
        options.embedderConfig
      )
    } catch (error) {
      logger.warn(`文件 ${filePath} 的 embedding 生成失败，回退纯 FTS`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const inputs: CreateChunkInput[] = chunks.map((chunk, i) => ({
    collectionId: options.collectionId,
    content: chunk.content,
    sourceFile: filePath,
    sourceTitle: chunk.sourceTitle,
    chunkIndex: chunk.chunkIndex,
    embedding: embeddings?.[i] ?? undefined,
  }))

  db.addChunks(inputs)
  return chunks.length
}

/**
 * 导入目录中的所有文档
 */
export async function importDirectory(
  dir: string,
  options: ImportOptions
): Promise<ImportResult> {
  const files = await scanFiles(dir)
  const db = getKnowledgeDB()

  let filesProcessed = 0
  let chunksCreated = 0
  let filesSkipped = 0

  for (const filePath of files) {
    try {
      // 增量更新：检查文件是否已导入且未变更
      const existingChunks = db.getChunksBySourceFile(filePath)
      if (existingChunks.length > 0) {
        const stat = await fs.stat(filePath)
        const lastChunk = existingChunks[existingChunks.length - 1]
        if (lastChunk && new Date(lastChunk.created_at) >= stat.mtime) {
          filesSkipped++
          continue
        }
        // 文件已变更，删除旧 chunk 后重新导入
        db.deleteChunksBySourceFile(filePath)
      }

      const count = await importFile(filePath, options)
      filesProcessed++
      chunksCreated += count
    } catch (error) {
      logger.error(`导入文件失败: ${filePath}`, error instanceof Error ? error : new Error(String(error)))
      filesSkipped++
    }
  }

  logger.info(`目录导入完成: ${dir}`, { filesProcessed, chunksCreated, filesSkipped })
  return { filesProcessed, chunksCreated, filesSkipped }
}

/**
 * 重新索引单个文件
 */
export async function reindexFile(
  filePath: string,
  options: ImportOptions
): Promise<number> {
  const db = getKnowledgeDB()
  db.deleteChunksBySourceFile(filePath)

  try {
    return await importFile(filePath, options)
  } catch (error) {
    logger.error(`重新索引文件失败: ${filePath}`, error instanceof Error ? error : new Error(String(error)))
    return 0
  }
}
