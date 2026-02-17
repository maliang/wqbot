/**
 * LSP Position
 */
export interface Position {
  readonly line: number
  readonly character: number
}

/**
 * LSP Range
 */
export interface Range {
  readonly start: Position
  readonly end: Position
}

/**
 * LSP Location
 */
export interface Location {
  readonly uri: string
  readonly range: Range
}

/**
 * LSP Diagnostic severity
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint'

/**
 * LSP Diagnostic
 */
export interface Diagnostic {
  readonly range: Range
  readonly message: string
  readonly severity: DiagnosticSeverity
  readonly source?: string
  readonly code?: string | number
  readonly relatedInformation?: Array<{
    readonly location: Location
    readonly message: string
  }>
}

/**
 * LSP Symbol kind
 */
export type SymbolKind =
  | 'file'
  | 'module'
  | 'namespace'
  | 'package'
  | 'class'
  | 'method'
  | 'property'
  | 'field'
  | 'constructor'
  | 'enum'
  | 'interface'
  | 'function'
  | 'variable'
  | 'constant'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'

/**
 * LSP Symbol information
 */
export interface SymbolInformation {
  readonly name: string
  readonly kind: SymbolKind
  readonly location: Location
  readonly containerName?: string
}

/**
 * LSP Document symbol (hierarchical)
 */
export interface DocumentSymbol {
  readonly name: string
  readonly kind: SymbolKind
  readonly range: Range
  readonly selectionRange: Range
  readonly children?: DocumentSymbol[]
}

/**
 * LSP Completion item kind
 */
export type CompletionItemKind =
  | 'text'
  | 'method'
  | 'function'
  | 'constructor'
  | 'field'
  | 'variable'
  | 'class'
  | 'interface'
  | 'module'
  | 'property'
  | 'keyword'
  | 'snippet'

/**
 * LSP Completion item
 */
export interface CompletionItem {
  readonly label: string
  readonly kind?: CompletionItemKind
  readonly detail?: string
  readonly documentation?: string
  readonly insertText?: string
}

/**
 * LSP Text edit
 */
export interface TextEdit {
  readonly range: Range
  readonly newText: string
}

/**
 * LSP Workspace edit
 */
export interface WorkspaceEdit {
  readonly changes?: Record<string, TextEdit[]>
}

/**
 * LSP Client capabilities
 */
export interface ClientCapabilities {
  readonly textDocument?: {
    readonly completion?: {
      readonly completionItem?: {
        readonly snippetSupport?: boolean
      }
    }
    readonly hover?: {
      readonly contentFormat?: ('plaintext' | 'markdown')[]
    }
  }
}

/**
 * LSP Server capabilities
 */
export interface ServerCapabilities {
  readonly textDocumentSync?: {
    readonly openClose?: boolean
    readonly change?: 0 | 1 | 2
    readonly save?: boolean
  }
  readonly completionProvider?: {
    readonly triggerCharacters?: string[]
    readonly resolveProvider?: boolean
  }
  readonly hoverProvider?: boolean
  readonly definitionProvider?: boolean
  readonly referencesProvider?: boolean
  readonly documentSymbolProvider?: boolean
  readonly workspaceSymbolProvider?: boolean
  readonly renameProvider?: boolean
  readonly diagnosticsProvider?: {
    readonly interFileDependencies: boolean
  }
}

/**
 * LSP Language configuration
 */
export interface LanguageConfig {
  readonly languageId: string
  readonly extensions: string[]
  readonly command: string
  readonly args?: string[]
  readonly cwd?: string
  readonly initializationOptions?: Record<string, unknown>
}

/**
 * Supported languages
 */
export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  typescript: {
    languageId: 'typescript',
    extensions: ['.ts', '.tsx'],
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  javascript: {
    languageId: 'javascript',
    extensions: ['.js', '.jsx'],
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  python: {
    languageId: 'python',
    extensions: ['.py'],
    command: 'pylsp',
    args: [],
  },
  go: {
    languageId: 'go',
    extensions: ['.go'],
    command: 'gopls',
    args: [],
  },
  rust: {
    languageId: 'rust',
    extensions: ['.rs'],
    command: 'rust-analyzer',
    args: [],
  },
}
