export type {
  KnowledgeConfig,
  KnowledgeEmbeddingConfig,
  KnowledgeCollectionConfig,
  SearchResult,
} from './types.js'

export {
  KnowledgeDB,
  getKnowledgeDB,
  serializeEmbedding,
  deserializeEmbedding,
  type KnowledgeCollection,
  type KnowledgeChunk,
  type CreateCollectionInput,
  type CreateChunkInput,
} from './database.js'

export {
  chunkDocument,
  type ChunkResult,
  type ChunkerOptions,
} from './chunker.js'

export {
  embedTexts,
  embedText,
  getEmbedderConfig,
  type EmbedderConfig,
} from './embedder.js'

export {
  search,
  type SearchOptions,
} from './search.js'

export {
  importDirectory,
  reindexFile,
  type ImportOptions,
  type ImportResult,
} from './importer.js'

export {
  KnowledgeManager,
  getKnowledgeManager,
  initializeKnowledge,
} from './knowledge-manager.js'
