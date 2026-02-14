import { Client } from '@modelcontextprotocol/sdk/client'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  type McpServerConfig,
  getConfigManager,
  createModuleLogger,
  expandVariables,
} from '@wqbot/core'
import type { ToolDefinition, ToolResult } from './tool-registry.js'

const logger = createModuleLogger('mcp-client')

export type MCPStatus =
  | { readonly status: 'connected' }
  | { readonly status: 'disabled' }
  | { readonly status: 'connecting' }
  | { readonly status: 'failed'; readonly error: string }

export interface MCPToolDef {
  readonly name: string
  readonly qualifiedName: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly clientName: string
}

interface MCPConnection {
  readonly client: Client
  readonly name: string
  status: MCPStatus
  tools: readonly MCPToolDef[]
}

export class MCPClientManager {
  private readonly connections: Map<string, MCPConnection> = new Map()

  async initialize(): Promise<void> {
    const config = getConfigManager()
    const mcpConfig = config.getMcpConfig()

    const entries = Object.entries(mcpConfig)
    if (entries.length === 0) {
      logger.debug('未配置 MCP 服务器')
      return
    }

    // 并行连接所有 MCP server，失败不阻塞
    await Promise.allSettled(
      entries.map(([name, serverConfig]) => this.connectServer(name, serverConfig))
    )

    const connected = [...this.connections.values()].filter((c) => c.status.status === 'connected')
    logger.info(`MCP 初始化完成: ${connected.length}/${entries.length} 个服务器已连接`)
  }

  private async connectServer(name: string, config: McpServerConfig): Promise<void> {
    if (!config.enabled) {
      this.connections.set(name, {
        client: null as unknown as Client,
        name,
        status: { status: 'disabled' },
        tools: [],
      })
      logger.debug(`MCP 服务器已禁用: ${name}`)
      return
    }

    const conn: MCPConnection = {
      client: new Client({ name: `wqbot-${name}`, version: '0.1.0' }),
      name,
      status: { status: 'connecting' },
      tools: [],
    }
    this.connections.set(name, conn)

    try {
      const transport = this.createTransport(name, config)
      await conn.client.connect(transport)

      // 发现工具
      const result = await conn.client.listTools()
      const tools: MCPToolDef[] = result.tools.map((t) => ({
        name: t.name,
        qualifiedName: `${name}_${t.name}`,
        description: t.description ?? '',
        inputSchema: t.inputSchema as Record<string, unknown>,
        clientName: name,
      }))

      conn.tools = tools
      conn.status = { status: 'connected' }
      logger.info(`MCP 服务器已连接: ${name} (${tools.length} 个工具)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      conn.status = { status: 'failed', error: message }
      logger.error(`MCP 服务器连接失败: ${name} - ${message}`)
    }
  }

  private createTransport(name: string, config: McpServerConfig) {
    if (config.type === 'remote') {
      if (!config.url) {
        throw new Error(`MCP 服务器 ${name} 缺少 url 配置`)
      }
      return new SSEClientTransport(new URL(config.url))
    }

    // local: stdio transport
    if (!config.command || config.command.length === 0) {
      throw new Error(`MCP 服务器 ${name} 缺少 command 配置`)
    }

    const command = config.command[0]!
    const args = config.command.slice(1)

    // 处理环境变量，支持 {env:VAR} 替换
    const env: Record<string, string> = { ...(process.env as Record<string, string>) }
    if (config.environment) {
      for (const [key, value] of Object.entries(config.environment)) {
        env[key] = expandVariables(value)
      }
    }

    return new StdioClientTransport({ command, args, env })
  }

  getTools(): readonly MCPToolDef[] {
    const tools: MCPToolDef[] = []
    for (const conn of this.connections.values()) {
      if (conn.status.status === 'connected') {
        tools.push(...conn.tools)
      }
    }
    return tools
  }

  // 将 MCP 工具转换为通用 ToolDefinition 格式
  getToolDefinitions(): readonly ToolDefinition[] {
    return this.getTools().map((mcpTool) => ({
      name: mcpTool.qualifiedName,
      description: `[${mcpTool.clientName}] ${mcpTool.description}`,
      inputSchema: mcpTool.inputSchema,
      source: 'mcp' as const,
      execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
        return this.callTool(mcpTool.qualifiedName, args)
      },
    }))
  }

  async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<ToolResult> {
    // 从 qualifiedName 解析 clientName 和 toolName
    const underscoreIdx = qualifiedName.indexOf('_')
    if (underscoreIdx === -1) {
      return { content: `无效的工具名称: ${qualifiedName}`, isError: true }
    }

    const clientName = qualifiedName.slice(0, underscoreIdx)
    const toolName = qualifiedName.slice(underscoreIdx + 1)

    const conn = this.connections.get(clientName)
    if (!conn || conn.status.status !== 'connected') {
      return { content: `MCP 服务器不可用: ${clientName}`, isError: true }
    }

    try {
      const result = await conn.client.callTool({ name: toolName, arguments: args })

      // 提取文本内容
      const textParts = (result.content as Array<{ type: string; text?: string }>)
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)

      return {
        content: textParts.join('\n') || JSON.stringify(result.content),
        isError: result.isError === true,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      logger.error(`MCP 工具调用失败: ${qualifiedName} - ${message}`)
      return { content: `工具调用失败: ${message}`, isError: true }
    }
  }

  getStatus(): Record<string, MCPStatus> {
    const status: Record<string, MCPStatus> = {}
    for (const [name, conn] of this.connections) {
      status[name] = conn.status
    }
    return status
  }

  async shutdown(): Promise<void> {
    const closePromises: Promise<void>[] = []

    for (const [name, conn] of this.connections) {
      if (conn.status.status === 'connected') {
        closePromises.push(
          conn.client.close().catch(() => {
            logger.warn(`关闭 MCP 服务器失败: ${name}`)
          })
        )
      }
    }

    await Promise.allSettled(closePromises)
    this.connections.clear()
    logger.info('所有 MCP 连接已关闭')
  }

  async reload(): Promise<void> {
    await this.shutdown()

    const config = getConfigManager()
    const mcpConfig = config.getMcpConfig()

    const entries = Object.entries(mcpConfig)
    if (entries.length === 0) return

    await Promise.allSettled(
      entries.map(([name, serverConfig]) => this.connectServer(name, serverConfig))
    )

    const connected = [...this.connections.values()].filter((c) => c.status.status === 'connected')
    logger.info(`MCP 重载完成: ${connected.length}/${entries.length} 个服务器已连接`)
  }
}

// Singleton
let mcpInstance: MCPClientManager | null = null

export function getMCPClientManager(): MCPClientManager {
  if (!mcpInstance) {
    mcpInstance = new MCPClientManager()
  }
  return mcpInstance
}

export async function initializeMCPClient(): Promise<MCPClientManager> {
  const manager = getMCPClientManager()
  await manager.initialize()
  return manager
}
