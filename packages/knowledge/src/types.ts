export interface KnowledgeEmbeddingConfig {
  readonly provider: string
  readonly model: string
  readonly customName?: string | undefined
}

export interface KnowledgeCollectionConfig {
  readonly name: string
  readonly dirs: readonly string[]
}

export interface KnowledgeConfig {
  readonly enabled?: boolean | undefined
  readonly chunkSize?: number | undefined
  readonly chunkOverlap?: number | undefined
  readonly embedding?: KnowledgeEmbeddingConfig | undefined
  readonly collections?: readonly KnowledgeCollectionConfig[] | undefined
}

export interface SearchResult {
  readonly id: string
  readonly content: string
  readonly sourceFile: string | null
  readonly sourceTitle: string | null
  readonly collectionName: string
  readonly score: number
}
