import { createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('tool-registry')

// 工具执行结果
export interface ToolResult {
  readonly content: string
  readonly isError?: boolean
}

// 通用工具定义（与 AI SDK 无关）
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly source: 'mcp' | 'skill' | 'builtin'
  readonly execute: (args: Record<string, unknown>) => Promise<ToolResult>
}

export class ToolRegistry {
  private readonly tools: Map<string, ToolDefinition> = new Map()

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`工具已注册，将覆盖: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
    logger.debug(`注册工具: ${tool.name} (来源: ${tool.source})`)
  }

  unregister(name: string): boolean {
    const deleted = this.tools.delete(name)
    if (deleted) {
      logger.debug(`注销工具: ${name}`)
    }
    return deleted
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  getAll(): readonly ToolDefinition[] {
    return [...this.tools.values()]
  }

  getBySource(source: ToolDefinition['source']): readonly ToolDefinition[] {
    return [...this.tools.values()].filter(t => t.source === source)
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { content: `工具不存在: ${name}`, isError: true }
    }

    try {
      return await tool.execute(args)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      logger.error(`工具执行失败: ${name}`, error instanceof Error ? error : undefined)
      return { content: `工具执行失败: ${message}`, isError: true }
    }
  }

  get size(): number {
    return this.tools.size
  }

  clear(): void {
    this.tools.clear()
  }
}

// Singleton
let registryInstance: ToolRegistry | null = null

export function getToolRegistry(): ToolRegistry {
  if (!registryInstance) {
    registryInstance = new ToolRegistry()
  }
  return registryInstance
}
