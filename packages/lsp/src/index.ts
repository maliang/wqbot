// Types
export type {
  Position,
  Range,
  Location,
  Diagnostic,
  DiagnosticSeverity,
  SymbolKind,
  SymbolInformation,
  DocumentSymbol,
  CompletionItem,
  CompletionItemKind,
  TextEdit,
  WorkspaceEdit,
  ServerCapabilities,
  LanguageConfig,
} from './types.js'

export { SUPPORTED_LANGUAGES } from './types.js'

// Client
export {
  LSPClient,
  LSPManager,
  getLSPManager,
  initializeLSP,
} from './client.js'
