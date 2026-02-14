import { embedMany } from 'ai'
import { getSDK } from '@wqbot/models'
import { createModuleLogger, type ModelProvider } from '@wqbot/core'
import type { KnowledgeConfig } from './types.js'

const logger = createModuleLogger('knowledge-embedder')

export interface EmbedderConfig {
  readonly provider: ModelProvider
  readonly model: string
  readonly customName?: string | undefined
}

/**
 * 从知识库配置中提取 embedding 配置
 */
export function getEmbedderConfig(knowledgeConfig: KnowledgeConfig): EmbedderConfig | null {
  const embeddingConf = knowledgeConfig.embedding
  if (!embeddingConf) return null

  return {
    provider: embeddingConf.provider as ModelProvider,
    model: embeddingConf.model,
    customName: embeddingConf.customName,
  }
}

/**
 * 生成文本向量
 */
export async function embedTexts(
  texts: readonly string[],
  config: EmbedderConfig
): Promise<readonly Float32Array[]> {
  if (texts.length === 0) return []

  try {
    const sdk = (await getSDK(config.provider, config.customName)) as Record<string, unknown>
    // Vercel AI SDK: sdk.textEmbeddingModel(modelId) 或 sdk.embedding(modelId)
    let embeddingModel: unknown
    if (typeof sdk.textEmbeddingModel === 'function') {
      embeddingModel = (sdk.textEmbeddingModel as (id: string) => unknown)(config.model)
    } else if (typeof sdk.embedding === 'function') {
      embeddingModel = (sdk.embedding as (id: string) => unknown)(config.model)
    } else {
      throw new Error(`Provider ${config.provider} 不支持 embedding`)
    }

    const { embeddings } = await embedMany({
      model: embeddingModel as Parameters<typeof embedMany>[0]['model'],
      values: texts as string[],
    })

    return embeddings.map((e) => new Float32Array(e))
  } catch (error) {
    logger.error('生成 embedding 失败:', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * 生成单条文本向量
 */
export async function embedText(text: string, config: EmbedderConfig): Promise<Float32Array> {
  const results = await embedTexts([text], config)
  return results[0]!
}
