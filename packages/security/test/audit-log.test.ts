import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { AuditLog, getAuditLog, initializeAuditLog } from '../src/audit-log.js'

describe('AuditLog', () => {
  let auditLog: AuditLog

  beforeEach(() => {
    auditLog = new AuditLog()
  })

  afterEach(() => {
    auditLog.clear()
  })

  describe('log', () => {
    it('logs an entry with timestamp', async () => {
      await auditLog.log({
        action: 'test:action',
        success: true,
      })

      const entries = auditLog.getRecent()
      expect(entries.length).toBe(1)
      expect(entries[0]!.action).toBe('test:action')
      expect(entries[0]!.success).toBe(true)
      expect(entries[0]!.timestamp).toBeInstanceOf(Date)
    })

    it('logs with skillName and userId', async () => {
      await auditLog.log({
        action: 'skill:execute',
        skillName: 'test-skill',
        userId: 'user-123',
        success: true,
      })

      const entries = auditLog.getRecent()
      expect(entries[0]!.skillName).toBe('test-skill')
      expect(entries[0]!.userId).toBe('user-123')
    })

    it('logs with details', async () => {
      await auditLog.log({
        action: 'file:write',
        success: true,
        details: { path: '/test/file.txt', size: 1024 },
      })

      const entries = auditLog.getRecent()
      expect(entries[0]!.details).toEqual({ path: '/test/file.txt', size: 1024 })
    })
  })

  describe('logSkillExecution', () => {
    it('logs skill execution with success', async () => {
      await auditLog.logSkillExecution('my-skill', true, { duration: 100 })

      const entries = auditLog.getRecent()
      expect(entries[0]!.action).toBe('skill:execute')
      expect(entries[0]!.skillName).toBe('my-skill')
      expect(entries[0]!.success).toBe(true)
      expect(entries[0]!.details).toEqual({ duration: 100 })
    })

    it('logs skill execution with failure', async () => {
      await auditLog.logSkillExecution('my-skill', false, { error: 'Something went wrong' })

      const entries = auditLog.getRecent()
      expect(entries[0]!.success).toBe(false)
    })
  })

  describe('logFileOperation', () => {
    it('logs file read operation', async () => {
      await auditLog.logFileOperation('read', '/test/file.txt', true)

      const entries = auditLog.getRecent()
      expect(entries[0]!.action).toBe('file:read')
      expect(entries[0]!.details).toEqual({ path: '/test/file.txt' })
    })

    it('logs file write operation', async () => {
      await auditLog.logFileOperation('write', '/test/file.txt', true, { bytes: 1024 })

      const entries = auditLog.getRecent()
      expect(entries[0]!.action).toBe('file:write')
      expect(entries[0]!.details).toEqual({ path: '/test/file.txt', bytes: 1024 })
    })

    it('logs file delete operation', async () => {
      await auditLog.logFileOperation('delete', '/test/file.txt', true)

      const entries = auditLog.getRecent()
      expect(entries[0]!.action).toBe('file:delete')
    })
  })

  describe('logCommandExecution', () => {
    it('logs command execution', async () => {
      await auditLog.logCommandExecution('npm install', true, { cwd: '/project' })

      const entries = auditLog.getRecent()
      expect(entries[0]!.action).toBe('shell:execute')
      expect(entries[0]!.details).toEqual({ command: 'npm install', cwd: '/project' })
    })
  })

  describe('logPermissionChange', () => {
    it('logs permission grant', async () => {
      await auditLog.logPermissionChange('test-skill', 'fs_read', true)

      const entries = auditLog.getRecent()
      expect(entries[0]!.action).toBe('permission:grant')
      expect(entries[0]!.skillName).toBe('test-skill')
      expect(entries[0]!.details).toEqual({ permission: 'fs_read' })
    })

    it('logs permission revoke', async () => {
      await auditLog.logPermissionChange('test-skill', 'fs_read', false)

      const entries = auditLog.getRecent()
      expect(entries[0]!.action).toBe('permission:revoke')
    })
  })

  describe('logSecurityViolation', () => {
    it('logs security violation', async () => {
      await auditLog.logSecurityViolation('file:read', {
        path: '/etc/passwd',
        reason: 'Attempted to read sensitive file',
      })

      const entries = auditLog.getRecent()
      expect(entries[0]!.action).toBe('security:violation')
      expect(entries[0]!.success).toBe(false)
      expect(entries[0]!.details).toEqual({
        attemptedAction: 'file:read',
        path: '/etc/passwd',
        reason: 'Attempted to read sensitive file',
      })
    })
  })

  describe('getRecent', () => {
    it('returns recent entries up to limit', async () => {
      for (let i = 0; i < 150; i++) {
        await auditLog.log({ action: `action-${i}`, success: true })
      }

      const entries = auditLog.getRecent(50)
      expect(entries.length).toBe(50)
      // Most recent should be last
      expect(entries[49]!.action).toBe('action-149')
    })

    it('returns all entries if less than limit', async () => {
      for (let i = 0; i < 10; i++) {
        await auditLog.log({ action: `action-${i}`, success: true })
      }

      const entries = auditLog.getRecent(50)
      expect(entries.length).toBe(10)
    })
  })

  describe('getByAction', () => {
    it('returns entries by action type', async () => {
      await auditLog.log({ action: 'file:read', success: true })
      await auditLog.log({ action: 'file:write', success: true })
      await auditLog.log({ action: 'file:read', success: true })

      const entries = auditLog.getByAction('file:read')
      expect(entries.length).toBe(2)
    })
  })

  describe('getBySkill', () => {
    it('returns entries by skill name', async () => {
      await auditLog.log({ action: 'skill:execute', skillName: 'skill-a', success: true })
      await auditLog.log({ action: 'skill:execute', skillName: 'skill-b', success: true })
      await auditLog.log({ action: 'skill:execute', skillName: 'skill-a', success: false })

      const entries = auditLog.getBySkill('skill-a')
      expect(entries.length).toBe(2)
    })
  })

  describe('getFailed', () => {
    it('returns only failed entries', async () => {
      await auditLog.log({ action: 'action-1', success: true })
      await auditLog.log({ action: 'action-2', success: false })
      await auditLog.log({ action: 'action-3', success: false })

      const entries = auditLog.getFailed()
      expect(entries.length).toBe(2)
      expect(entries.every((e) => !e.success)).toBe(true)
    })
  })

  describe('getByTimeRange', () => {
    it('returns entries within time range', async () => {
      const start = new Date()
      await auditLog.log({ action: 'action-1', success: true })
      await new Promise((resolve) => setTimeout(resolve, 10))
      await auditLog.log({ action: 'action-2', success: true })
      await new Promise((resolve) => setTimeout(resolve, 10))
      const mid = new Date()
      await auditLog.log({ action: 'action-3', success: true })
      await new Promise((resolve) => setTimeout(resolve, 10))
      const end = new Date()

      const entries = auditLog.getByTimeRange(mid, end)
      expect(entries.length).toBe(1)
      expect(entries[0]!.action).toBe('action-3')
    })
  })

  describe('clear', () => {
    it('clears all entries', async () => {
      await auditLog.log({ action: 'action-1', success: true })
      await auditLog.log({ action: 'action-2', success: true })

      auditLog.clear()
      expect(auditLog.getCount()).toBe(0)
    })
  })

  describe('getCount', () => {
    it('returns entry count', async () => {
      expect(auditLog.getCount()).toBe(0)
      await auditLog.log({ action: 'action-1', success: true })
      expect(auditLog.getCount()).toBe(1)
    })
  })

  describe('export', () => {
    it('exports entries to JSON', async () => {
      await auditLog.log({ action: 'action-1', success: true, details: { key: 'value' } })

      const json = auditLog.export()
      const parsed = JSON.parse(json)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed[0].action).toBe('action-1')
    })
  })

  describe('getStats', () => {
    it('returns statistics', async () => {
      await auditLog.log({ action: 'file:read', success: true })
      await auditLog.log({ action: 'file:write', success: true })
      await auditLog.log({ action: 'file:read', success: false })

      const stats = auditLog.getStats()

      expect(stats.total).toBe(3)
      expect(stats.successful).toBe(2)
      expect(stats.failed).toBe(1)
      expect(stats.byAction['file:read']).toBe(2)
      expect(stats.byAction['file:write']).toBe(1)
    })
  })

  describe('maxEntries', () => {
    it('trims entries when max is exceeded', async () => {
      const smallAuditLog = new AuditLog(10)

      for (let i = 0; i < 15; i++) {
        await smallAuditLog.log({ action: `action-${i}`, success: true })
      }

      expect(smallAuditLog.getCount()).toBe(10)
      const entries = smallAuditLog.getRecent()
      expect(entries[0]!.action).toBe('action-5') // First 5 were trimmed
    })
  })

  describe('onEntry callback', () => {
    it('calls callback on new entry', async () => {
      const callback = vi.fn()
      auditLog.onEntry(callback)

      await auditLog.log({ action: 'test-action', success: true })

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ action: 'test-action' }))
    })

    it('returns unsubscribe function', async () => {
      const callback = vi.fn()
      const unsubscribe = auditLog.onEntry(callback)

      unsubscribe()
      await auditLog.log({ action: 'test-action', success: true })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('setPersistCallback', () => {
    it('calls persist callback on entry', async () => {
      const persistCallback = vi.fn()
      auditLog.setPersistCallback(persistCallback)

      await auditLog.log({ action: 'test-action', success: true })

      expect(persistCallback).toHaveBeenCalledTimes(1)
    })
  })
})

describe('getAuditLog', () => {
  it('returns singleton instance', () => {
    const instance1 = getAuditLog()
    const instance2 = getAuditLog()
    expect(instance1).toBe(instance2)
  })
})

describe('initializeAuditLog', () => {
  it('returns the singleton instance', () => {
    const instance = initializeAuditLog()
    expect(instance).toBe(getAuditLog())
  })
})
