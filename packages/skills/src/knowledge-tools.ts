import { getKnowledgeManager } from '@wqbot/knowledge'
import { getToolRegistry, type ToolDefinition } from './tool-registry.js'
import { createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('knowledge-tools')

function createSearchKnowledgeTool(): ToolDefinition {
  return {
    name: 'search_knowledge',
    description: '搜索知识库，返回与查询最相关的文档片段',
    source: 'builtin',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词或问题' },
        collection: { type: 'string', description: '集合名称（可选）' },
        limit: { type: 'number', description: '返回条数，默认 5' },
      },
      required: ['query'],
    },
    execute: async (args) => {
      try {
        const manager = getKnowledgeManager()
        if (!manager.isEnabled()) {
          return { content: '知识库未启用。请在 ~/.wqbot/config.yaml 中设置 knowledge.enabled: true' }
        }

        const query = args.query as string
        const collection = args.collection as string | undefined
        const limit = (args.limit as number) ?? 5

        const results = await manager.search(query, collection, limit)

        if (results.length === 0) {
          return { content: `未找到与 "${query}" 相关的知识` }
        }

        const formatted = results
          .map((r, i) => {
            const source = r.sourceTitle ?? r.sourceFile ?? '未知来源'
            return `[${i + 1}] (${r.collectionName}) ${source}\n${r.content}`
          })
          .join('\n\n---\n\n')

        return { content: formatted }
      } catch (error) {
        const message = error instanceof Error ? error.message : '搜索失败'
        return { content: message, isError: true }
      }
    },
  }
}

function createAddKnowledgeTool(): ToolDefinition {
  return {
    name: 'add_knowledge',
    description: '向知识库添加一条文本知识',
    source: 'builtin',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '要添加的文本内容' },
        collection: { type: 'string', description: '集合名称，默认 default' },
        title: { type: 'string', description: '文档标题（可选）' },
      },
      required: ['content'],
    },
    execute: async (args) => {
      try {
        const manager = getKnowledgeManager()
        if (!manager.isEnabled()) {
          return { content: '知识库未启用' }
        }

        const content = args.content as string
        const collection = (args.collection as string) ?? 'default'
        const title = args.title as string | undefined

        const chunksCreated = await manager.addText(content, collection, title)
        return { content: `已添加到知识库 [${collection}]，生成 ${chunksCreated} 个分块` }
      } catch (error) {
        const message = error instanceof Error ? error.message : '添加失败'
        return { content: message, isError: true }
      }
    },
  }
}

function createListKnowledgeTool(): ToolDefinition {
  return {
    name: 'list_knowledge',
    description: '列出知识库集合和文档数量',
    source: 'builtin',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      try {
        const manager = getKnowledgeManager()
        if (!manager.isEnabled()) {
          return { content: '知识库未启用' }
        }

        const collections = manager.listCollections()

        if (collections.length === 0) {
          return { content: '知识库为空，尚未创建任何集合' }
        }

        const lines = collections.map(
          (c) => `- ${c.name}: ${c.chunkCount} 个分块`
        )
        return { content: `知识库集合:\n${lines.join('\n')}` }
      } catch (error) {
        const message = error instanceof Error ? error.message : '查询失败'
        return { content: message, isError: true }
      }
    },
  }
}

/**
 * 注册知识库工具到 ToolRegistry
 */
export function registerKnowledgeTools(): void {
  const registry = getToolRegistry()

  registry.register(createSearchKnowledgeTool())
  registry.register(createAddKnowledgeTool())
  registry.register(createListKnowledgeTool())

  logger.info('知识库工具已注册 (3 个)')
}

/**
 * 注销知识库工具
 */
export function unregisterKnowledgeTools(): void {
  const registry = getToolRegistry()
  registry.unregister('search_knowledge')
  registry.unregister('add_knowledge')
  registry.unregister('list_knowledge')
}
