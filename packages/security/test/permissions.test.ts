import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { PermissionManager, getPermissionManager, initializePermissionManager } from '../src/permissions.js'

describe('PermissionManager', () => {
  let manager: PermissionManager

  beforeEach(() => {
    manager = new PermissionManager()
  })

  afterEach(() => {
    manager.clearAll()
  })

  describe('grant', () => {
    it('grants a permission to a skill', () => {
      manager.grant('test-skill', 'fs_read')
      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(true)
    })

    it('does not duplicate grants', () => {
      manager.grant('test-skill', 'fs_read')
      manager.grant('test-skill', 'fs_read')
      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(true)
    })

    it('grants with expiration', async () => {
      const expiresAt = new Date(Date.now() + 1000) // 1 second
      manager.grant('test-skill', 'fs_read', { expiresAt })
      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(true)

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100))
      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(false)
    })
  })

  describe('grantMany', () => {
    it('grants multiple permissions at once', () => {
      manager.grantMany('test-skill', ['fs_read', 'fs_write', 'shell_exec'])
      expect(manager.hasAllPermissions('test-skill', ['fs_read', 'fs_write', 'shell_exec'])).toBe(true)
    })
  })

  describe('revoke', () => {
    it('revokes a permission from a skill', () => {
      manager.grant('test-skill', 'fs_read')
      manager.revoke('test-skill', 'fs_read')
      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(false)
    })
  })

  describe('revokeAll', () => {
    it('revokes all permissions from a skill', () => {
      manager.grantMany('test-skill', ['fs_read', 'fs_write'])
      manager.revokeAll('test-skill')
      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(false)
      expect(manager.hasPermission('test-skill', 'fs_write')).toBe(false)
    })
  })

  describe('hasPermission', () => {
    it('returns false for ungranted permission', () => {
      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(false)
    })

    it('returns true for global permission', () => {
      manager.grantGlobal('fs_read')
      expect(manager.hasPermission('any-skill', 'fs_read')).toBe(true)
    })

    it('returns false for expired permission', async () => {
      const expiresAt = new Date(Date.now() - 1000) // Already expired
      manager.grant('test-skill', 'fs_read', { expiresAt })
      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(false)
    })
  })

  describe('hasAllPermissions', () => {
    it('returns true when all permissions are granted', () => {
      manager.grantMany('test-skill', ['fs_read', 'fs_write'])
      expect(manager.hasAllPermissions('test-skill', ['fs_read', 'fs_write'])).toBe(true)
    })

    it('returns false when some permissions are missing', () => {
      manager.grant('test-skill', 'fs_read')
      expect(manager.hasAllPermissions('test-skill', ['fs_read', 'fs_write'])).toBe(false)
    })
  })

  describe('getPermissions', () => {
    it('returns all valid permissions for a skill', () => {
      manager.grantMany('test-skill', ['fs_read', 'fs_write'])
      const permissions = manager.getPermissions('test-skill')
      expect(permissions).toContain('fs_read')
      expect(permissions).toContain('fs_write')
    })

    it('includes global permissions', () => {
      manager.grantGlobal('fs_read')
      const permissions = manager.getPermissions('test-skill')
      expect(permissions).toContain('fs_read')
    })
  })

  describe('requestPermissions', () => {
    it('returns true if all permissions already granted', async () => {
      manager.grant('test-skill', 'fs_read')
      const result = await manager.requestPermissions({
        skillName: 'test-skill',
        permissions: ['fs_read'],
      })
      expect(result).toBe(true)
    })

    it('calls callback for missing permissions', async () => {
      const callback = vi.fn().mockResolvedValue(true)
      manager.setPermissionCallback(callback)

      const result = await manager.requestPermissions({
        skillName: 'test-skill',
        permissions: ['fs_read'],
        reason: 'Need to read files',
      })

      expect(callback).toHaveBeenCalledWith({
        skillName: 'test-skill',
        permissions: ['fs_read'],
        reason: 'Need to read files',
      })
      expect(result).toBe(true)
    })

    it('grants permissions when callback returns true', async () => {
      manager.setPermissionCallback(async () => true)

      await manager.requestPermissions({
        skillName: 'test-skill',
        permissions: ['fs_read'],
      })

      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(true)
    })

    it('denies when no callback is set', async () => {
      const result = await manager.requestPermissions({
        skillName: 'test-skill',
        permissions: ['fs_read'],
      })
      expect(result).toBe(false)
    })
  })

  describe('grantGlobal / revokeGlobal', () => {
    it('grants permission to all skills', () => {
      manager.grantGlobal('fs_read')
      expect(manager.hasPermission('skill1', 'fs_read')).toBe(true)
      expect(manager.hasPermission('skill2', 'fs_read')).toBe(true)
    })

    it('revokes global permission', () => {
      manager.grantGlobal('fs_read')
      manager.revokeGlobal('fs_read')
      expect(manager.hasPermission('skill1', 'fs_read')).toBe(false)
    })
  })

  describe('getGlobalPermissions', () => {
    it('returns all global permissions', () => {
      manager.grantGlobal('fs_read')
      manager.grantGlobal('fs_write')
      const permissions = manager.getGlobalPermissions()
      expect(permissions).toContain('fs_read')
      expect(permissions).toContain('fs_write')
    })
  })

  describe('clearAll', () => {
    it('clears all grants', () => {
      manager.grant('test-skill', 'fs_read')
      manager.grantGlobal('fs_write')
      manager.clearAll()
      expect(manager.hasPermission('test-skill', 'fs_read')).toBe(false)
      expect(manager.hasPermission('any-skill', 'fs_write')).toBe(false)
    })
  })

  // Tool-level permission tests
  describe('setToolMode', () => {
    it('sets permission mode for a tool', () => {
      manager.setToolMode('bash', 'allow')
      expect(manager.getToolMode('bash')).toBe('allow')
    })

    it('is case-insensitive', () => {
      manager.setToolMode('Bash', 'allow')
      expect(manager.getToolMode('BASH')).toBe('allow')
    })
  })

  describe('getToolMode', () => {
    it('returns default mode for unset tool', () => {
      expect(manager.getToolMode('unknown-tool')).toBe('ask')
    })
  })

  describe('setToolModes', () => {
    it('sets modes for multiple tools', () => {
      manager.setToolModes([
        { tool: 'bash', mode: 'allow' },
        { tool: 'fs_write', mode: 'deny' },
      ])
      expect(manager.getToolMode('bash')).toBe('allow')
      expect(manager.getToolMode('fs_write')).toBe('deny')
    })
  })

  describe('checkToolPermission', () => {
    it('returns allowed for allow mode', async () => {
      manager.setToolMode('bash', 'allow')
      const result = await manager.checkToolPermission('bash')
      expect(result.allowed).toBe(true)
      expect(result.mode).toBe('allow')
      expect(result.shouldAsk).toBe(false)
    })

    it('returns denied for deny mode', async () => {
      manager.setToolMode('bash', 'deny')
      const result = await manager.checkToolPermission('bash')
      expect(result.allowed).toBe(false)
      expect(result.mode).toBe('deny')
      expect(result.reason).toContain('denied')
    })

    it('asks callback for ask mode', async () => {
      const callback = vi.fn().mockResolvedValue(true)
      manager.setToolAskCallback(callback)

      const result = await manager.checkToolPermission('bash', 'Need to run command')

      expect(callback).toHaveBeenCalledWith('bash', 'Need to run command')
      expect(result.allowed).toBe(true)
    })

    it('caches decision after user grants', async () => {
      const callback = vi.fn().mockResolvedValue(true)
      manager.setToolAskCallback(callback)

      await manager.checkToolPermission('bash')
      await manager.checkToolPermission('bash')

      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('isToolAllowed', () => {
    it('returns true for allow mode', () => {
      manager.setToolMode('bash', 'allow')
      expect(manager.isToolAllowed('bash')).toBe(true)
    })

    it('returns false for deny/ask mode', () => {
      manager.setToolMode('bash', 'deny')
      expect(manager.isToolAllowed('bash')).toBe(false)

      manager.setToolMode('bash', 'ask')
      expect(manager.isToolAllowed('bash')).toBe(false)
    })
  })

  describe('getToolRules', () => {
    it('returns all tool rules', () => {
      manager.setToolMode('bash', 'allow')
      manager.setToolMode('fs_write', 'deny')
      const rules = manager.getToolRules()
      expect(rules.some((r) => r.tool === 'bash' && r.mode === 'allow')).toBe(true)
      expect(rules.some((r) => r.tool === 'fs_write' && r.mode === 'deny')).toBe(true)
    })
  })

  describe('exportToolGrants / importToolGrants', () => {
    it('exports and imports tool grants', () => {
      manager.setToolMode('bash', 'allow')
      manager.setToolMode('fs_write', 'deny')

      const exported = manager.exportToolGrants()
      expect(exported['bash']).toBe('allow')
      expect(exported['fs_write']).toBe('deny')

      const newManager = new PermissionManager()
      newManager.importToolGrants(exported)
      expect(newManager.getToolMode('bash')).toBe('allow')
      expect(newManager.getToolMode('fs_write')).toBe('deny')
    })
  })

  describe('exportGrants / importGrants', () => {
    it('exports and imports skill grants', () => {
      manager.grant('test-skill', 'fs_read')
      manager.grant('test-skill', 'fs_write')

      const exported = manager.exportGrants()
      expect(exported['test-skill']).toBeDefined()

      const newManager = new PermissionManager()
      newManager.importGrants(exported)
      expect(newManager.hasPermission('test-skill', 'fs_read')).toBe(true)
      expect(newManager.hasPermission('test-skill', 'fs_write')).toBe(true)
    })
  })
})

describe('getPermissionManager', () => {
  it('returns singleton instance', () => {
    const instance1 = getPermissionManager()
    const instance2 = getPermissionManager()
    expect(instance1).toBe(instance2)
  })
})

describe('initializePermissionManager', () => {
  it('returns the singleton instance', () => {
    const instance = initializePermissionManager()
    expect(instance).toBe(getPermissionManager())
  })
})
