import { spawn, ChildProcess } from 'node:child_process'
import { createModuleLogger } from '@wqbot/core'
import type {
  Position,
  Range,
  Location,
  Diagnostic,
  SymbolInformation,
  DocumentSymbol,
  CompletionItem,
  ServerCapabilities,
  LanguageConfig,
} from './types.js'
import { SUPPORTED_LANGUAGES } from './types.js'

const logger = createModuleLogger('lsp-client')

/**
 * JSON-RPC message types
 */
interface RequestMessage {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown
}

interface ResponseMessage {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface NotificationMessage {
  jsonrpc: '2.0'
  method: string
  params: unknown
}

/**
 * LSP Client for a single language server
 */
export class LSPClient {
  private process: ChildProcess | null = null
  private requestId = 0
  private readonly pendingRequests = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private buffer = ''
  private capabilities: ServerCapabilities | null = null
  private initialized = false

  constructor(
    private readonly config: LanguageConfig,
    private readonly workspaceRoot: string
  ) {}

  /**
   * Start the language server
   */
  async start(): Promise<void> {
    if (this.process) return

    logger.info(`Starting LSP server: ${this.config.command}`)

    this.process = spawn(this.config.command, this.config.args ?? [], {
      cwd: this.config.cwd ?? this.workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString())
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      logger.debug(`LSP stderr: ${data.toString()}`)
    })

    this.process.on('error', (error) => {
      logger.error(`LSP process error`, error)
    })

    this.process.on('exit', (code) => {
      logger.info(`LSP process exited: code ${code}`)
      this.process = null
      this.initialized = false
    })

    // Initialize
    await this.initialize()
  }

  /**
   * Stop the language server
   */
  async stop(): Promise<void> {
    if (!this.process) return

    try {
      await this.sendRequest('shutdown', {})
      this.sendNotification('exit', {})
    } catch {
      // Ignore errors during shutdown
    }

    this.process?.kill()
    this.process = null
    this.initialized = false
    this.pendingRequests.clear()
  }

  /**
   * Initialize the language server
   */
  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${this.workspaceRoot}`,
      capabilities: {
        textDocument: {
          completion: {
            completionItem: { snippetSupport: true },
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
        },
      },
      initializationOptions: this.config.initializationOptions,
    })

    this.capabilities = (result as { capabilities: ServerCapabilities }).capabilities
    this.initialized = true

    // Send initialized notification
    this.sendNotification('initialized', {})

    logger.info(`LSP initialized: ${this.config.languageId}`)
  }

  /**
   * Open a document
   */
  async openDocument(uri: string, content: string, version = 0): Promise<void> {
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.config.languageId,
        version,
        text: content,
      },
    })
  }

  /**
   * Update a document
   */
  async updateDocument(uri: string, content: string, version: number): Promise<void> {
    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    })
  }

  /**
   * Close a document
   */
  async closeDocument(uri: string): Promise<void> {
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    })
  }

  /**
   * Get diagnostics for a document
   */
  async getDiagnostics(uri: string): Promise<Diagnostic[]> {
    // Some LSP servers push diagnostics via notifications
    // This method returns cached diagnostics if available
    return []
  }

  /**
   * Go to definition
   */
  async gotoDefinition(uri: string, position: Position): Promise<Location[] | null> {
    if (!this.capabilities?.definitionProvider) return null

    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position,
    })

    if (!result) return null

    // Handle both Location and Location[] responses
    if (Array.isArray(result)) {
      return result as Location[]
    }
    return [result as Location]
  }

  /**
   * Find references
   */
  async findReferences(uri: string, position: Position, includeDeclaration = true): Promise<Location[] | null> {
    if (!this.capabilities?.referencesProvider) return null

    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration },
    })

    return result as Location[] | null
  }

  /**
   * Get document symbols
   */
  async getDocumentSymbols(uri: string): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    if (!this.capabilities?.documentSymbolProvider) return null

    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    })

    return result as DocumentSymbol[] | SymbolInformation[] | null
  }

  /**
   * Get workspace symbols
   */
  async getWorkspaceSymbols(query: string): Promise<SymbolInformation[] | null> {
    if (!this.capabilities?.workspaceSymbolProvider) return null

    const result = await this.sendRequest('workspace/symbol', { query })
    return result as SymbolInformation[] | null
  }

  /**
   * Get completions
   */
  async getCompletions(uri: string, position: Position): Promise<CompletionItem[] | null> {
    if (!this.capabilities?.completionProvider) return null

    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position,
    })

    if (!result) return null

    // Handle both CompletionItem[] and CompletionList
    if (Array.isArray(result)) {
      return result as CompletionItem[]
    }
    return (result as { items: CompletionItem[] }).items
  }

  /**
   * Rename symbol
   */
  async rename(uri: string, position: Position, newName: string): Promise<{ changes: Record<string, unknown> } | null> {
    if (!this.capabilities?.renameProvider) return null

    const result = await this.sendRequest('textDocument/rename', {
      textDocument: { uri },
      position,
      newName,
    })

    return result as { changes: Record<string, unknown> } | null
  }

  /**
   * Get hover information
   */
  async getHover(uri: string, position: Position): Promise<{ contents: unknown } | null> {
    if (!this.capabilities?.hoverProvider) return null

    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position,
    })

    return result as { contents: unknown } | null
  }

  /**
   * Send a JSON-RPC request
   */
  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('LSP process not started'))
        return
      }

      const id = ++this.requestId
      const message: RequestMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      this.pendingRequests.set(id, { resolve, reject })

      const content = JSON.stringify(message)
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`

      this.process.stdin.write(header + content)
    })
  }

  /**
   * Send a JSON-RPC notification
   */
  private sendNotification(method: string, params: unknown): void {
    if (!this.process?.stdin) return

    const message: NotificationMessage = {
      jsonrpc: '2.0',
      method,
      params,
    }

    const content = JSON.stringify(message)
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`

    this.process.stdin.write(header + content)
  }

  /**
   * Handle incoming data from the language server
   */
  private handleData(data: string): void {
    this.buffer += data

    while (true) {
      // Find Content-Length header
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break

      const header = this.buffer.slice(0, headerEnd)
      const contentLengthMatch = header.match(/Content-Length: (\d+)/i)
      if (!contentLengthMatch) break

      const contentLength = parseInt(contentLengthMatch[1]!, 10)
      const messageStart = headerEnd + 4
      const messageEnd = messageStart + contentLength

      if (this.buffer.length < messageEnd) break

      const messageContent = this.buffer.slice(messageStart, messageEnd)
      this.buffer = this.buffer.slice(messageEnd)

      try {
        const message = JSON.parse(messageContent) as ResponseMessage | NotificationMessage

        if ('id' in message) {
          // Response
          const pending = this.pendingRequests.get(message.id)
          if (pending) {
            this.pendingRequests.delete(message.id)
            if (message.error) {
              pending.reject(new Error(message.error.message))
            } else {
              pending.resolve(message.result)
            }
          }
        } else {
          // Notification
          this.handleNotification(message.method, message.params)
        }
      } catch (error) {
        logger.error('Failed to parse LSP message', error instanceof Error ? error : undefined)
      }
    }
  }

  /**
   * Handle LSP notifications
   */
  private handleNotification(method: string, params: unknown): void {
    switch (method) {
      case 'textDocument/publishDiagnostics':
        // Could emit an event or store diagnostics
        logger.debug('Received diagnostics', { params })
        break
      case 'window/logMessage':
        logger.debug('LSP log', { params })
        break
      case 'window/showMessage':
        logger.info('LSP message', { params })
        break
    }
  }

  /**
   * Check if client is ready
   */
  isReady(): boolean {
    return this.initialized && this.process !== null
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): ServerCapabilities | null {
    return this.capabilities
  }
}

/**
 * LSP Manager - manages multiple language servers
 */
export class LSPManager {
  private readonly clients = new Map<string, LSPClient>()

  constructor(private readonly workspaceRoot: string) {}

  /**
   * Get or create a client for a language
   */
  async getClient(languageId: string): Promise<LSPClient | null> {
    const config = SUPPORTED_LANGUAGES[languageId]
    if (!config) {
      logger.warn(`Unsupported language: ${languageId}`)
      return null
    }

    let client = this.clients.get(languageId)
    if (!client) {
      client = new LSPClient(config, this.workspaceRoot)
      this.clients.set(languageId, client)
    }

    if (!client.isReady()) {
      await client.start()
    }

    return client
  }

  /**
   * Get client by file extension
   */
  async getClientForFile(filePath: string): Promise<LSPClient | null> {
    const ext = filePath.substring(filePath.lastIndexOf('.'))
    
    for (const [languageId, config] of Object.entries(SUPPORTED_LANGUAGES)) {
      if (config.extensions.includes(ext)) {
        return this.getClient(languageId)
      }
    }

    return null
  }

  /**
   * Stop all clients
   */
  async stopAll(): Promise<void> {
    await Promise.all([...this.clients.values()].map(client => client.stop()))
    this.clients.clear()
  }
}

// Singleton
let managerInstance: LSPManager | null = null

export function getLSPManager(workspaceRoot?: string): LSPManager {
  if (!managerInstance) {
    managerInstance = new LSPManager(workspaceRoot ?? process.cwd())
  }
  return managerInstance
}

export async function initializeLSP(workspaceRoot?: string): Promise<LSPManager> {
  const manager = getLSPManager(workspaceRoot)
  return manager
}
