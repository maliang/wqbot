import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getConfigManager: () => ({
    getDataDir: () => '/tmp/wqbot',
  }),
}))

import { LSPClient, LSPManager, getLSPManager } from '../src/client.js'
import { SUPPORTED_LANGUAGES } from '../src/types.js'

// Get the first supported language for testing
const testLanguageId = Object.keys(SUPPORTED_LANGUAGES)[0]!
const testConfig = SUPPORTED_LANGUAGES[testLanguageId]!

describe('LSPClient', () => {
  let client: LSPClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new LSPClient(testConfig, '/tmp/test-workspace')
  })

  describe('constructor', () => {
    it('creates client instance', () => {
      expect(client).toBeDefined()
    })
  })

  describe('start', () => {
    it('has start method', () => {
      expect(typeof client.start).toBe('function')
    })
  })

  describe('stop', () => {
    it('has stop method (shutdown client)', () => {
      expect(typeof client.stop).toBe('function')
    })
  })

  describe('textDocument/didOpen', () => {
    it('has openDocument method', () => {
      expect(typeof client.openDocument).toBe('function')
    })
  })

  describe('textDocument/didChange', () => {
    it('has updateDocument method', () => {
      expect(typeof client.updateDocument).toBe('function')
    })
  })

  describe('textDocument/didClose', () => {
    it('has closeDocument method', () => {
      expect(typeof client.closeDocument).toBe('function')
    })
  })

  describe('textDocument/hover', () => {
    it('has getHover method', () => {
      expect(typeof client.getHover).toBe('function')
    })
  })

  describe('textDocument/completion', () => {
    it('has getCompletions method', () => {
      expect(typeof client.getCompletions).toBe('function')
    })
  })

  describe('textDocument/definition', () => {
    it('has gotoDefinition method', () => {
      expect(typeof client.gotoDefinition).toBe('function')
    })
  })

  describe('textDocument/references', () => {
    it('has findReferences method', () => {
      expect(typeof client.findReferences).toBe('function')
    })
  })

  describe('textDocument/rename', () => {
    it('has rename method', () => {
      expect(typeof client.rename).toBe('function')
    })
  })

  describe('textDocument/diagnostics', () => {
    it('has getDiagnostics method', () => {
      expect(typeof client.getDiagnostics).toBe('function')
    })
  })

  describe('capabilities', () => {
    it('has getCapabilities method', () => {
      expect(typeof client.getCapabilities).toBe('function')
    })
  })

  describe('isReady', () => {
    it('has isReady method', () => {
      expect(typeof client.isReady).toBe('function')
    })

    it('returns false before start', () => {
      expect(client.isReady()).toBe(false)
    })
  })
})

describe('LSPManager', () => {
  let manager: LSPManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new LSPManager('/tmp/test-workspace')
  })

  describe('getClient', () => {
    it('has getClient method', () => {
      expect(typeof manager.getClient).toBe('function')
    })
  })

  describe('getClientForFile', () => {
    it('has getClientForFile method', () => {
      expect(typeof manager.getClientForFile).toBe('function')
    })
  })

  describe('stopAll', () => {
    it('has stopAll method', () => {
      expect(typeof manager.stopAll).toBe('function')
    })
  })
})

describe('getLSPManager', () => {
  it('returns singleton instance', () => {
    const instance1 = getLSPManager()
    const instance2 = getLSPManager()
    expect(instance1).toBe(instance2)
  })
})

describe('LSPClient integration', () => {
  it('handles multiple file types', () => {
    // TypeScript
    const tsConfig = SUPPORTED_LANGUAGES['typescript']
    if (tsConfig) {
      const tsClient = new LSPClient(tsConfig, '/tmp/test-workspace')
      expect(tsClient).toBeDefined()
    }

    // JavaScript
    const jsConfig = SUPPORTED_LANGUAGES['javascript']
    if (jsConfig) {
      const jsClient = new LSPClient(jsConfig, '/tmp/test-workspace')
      expect(jsClient).toBeDefined()
    }
  })
})
