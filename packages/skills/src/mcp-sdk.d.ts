// MCP SDK 子路径模块声明（tsup DTS 构建无法解析 wildcard exports）
declare module '@modelcontextprotocol/sdk/client/stdio' {
  import type { Transport } from '@modelcontextprotocol/sdk/client'
  export interface StdioServerParameters {
    command: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
  }
  export class StdioClientTransport implements Transport {
    constructor(server: StdioServerParameters)
    start(): Promise<void>
    close(): Promise<void>
    send(message: unknown): Promise<void>
  }
}

declare module '@modelcontextprotocol/sdk/client/sse' {
  import type { Transport } from '@modelcontextprotocol/sdk/client'
  export class SSEClientTransport implements Transport {
    constructor(url: URL, opts?: Record<string, unknown>)
    start(): Promise<void>
    close(): Promise<void>
    send(message: unknown): Promise<void>
  }
}
