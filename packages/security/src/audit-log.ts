import { createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('audit-log')

export interface AuditEntry {
  readonly id?: number | undefined
  readonly timestamp: Date
  readonly action: string
  readonly skillName?: string | undefined
  readonly userId?: string | undefined
  readonly details?: Record<string, unknown> | undefined
  readonly success: boolean
}

type AuditCallback = (entry: AuditEntry) => void | Promise<void>

export class AuditLog {
  private readonly entries: AuditEntry[] = []
  private readonly maxEntries: number
  private callbacks: AuditCallback[] = []
  private persistCallback: ((entry: AuditEntry) => Promise<void>) | null = null

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries
  }

  /**
   * Set a callback for persisting entries to database
   */
  setPersistCallback(callback: (entry: AuditEntry) => Promise<void>): void {
    this.persistCallback = callback
  }

  /**
   * Add a callback for new entries
   */
  onEntry(callback: AuditCallback): () => void {
    this.callbacks.push(callback)
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * Log an action
   */
  async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date(),
    }

    // Add to in-memory log
    this.entries.push(fullEntry)

    // Trim if necessary
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }

    // Persist to database if callback is set
    if (this.persistCallback) {
      try {
        await this.persistCallback(fullEntry)
      } catch (error) {
        logger.error('Failed to persist audit entry', error instanceof Error ? error : undefined)
      }
    }

    // Notify callbacks
    for (const callback of this.callbacks) {
      try {
        await callback(fullEntry)
      } catch (error) {
        logger.error('Audit callback failed', error instanceof Error ? error : undefined)
      }
    }

    // Log to system logger
    if (fullEntry.success) {
      logger.debug('Audit log entry', {
        action: fullEntry.action,
        skillName: fullEntry.skillName,
      })
    } else {
      logger.warn('Audit log entry (failed)', {
        action: fullEntry.action,
        skillName: fullEntry.skillName,
        details: fullEntry.details,
      })
    }
  }

  /**
   * Log a skill execution
   */
  async logSkillExecution(
    skillName: string,
    success: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: 'skill:execute',
      skillName,
      success,
      details,
    })
  }

  /**
   * Log a file operation
   */
  async logFileOperation(
    operation: 'read' | 'write' | 'delete',
    path: string,
    success: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: `file:${operation}`,
      success,
      details: { path, ...details },
    })
  }

  /**
   * Log a command execution
   */
  async logCommandExecution(
    command: string,
    success: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: 'shell:execute',
      success,
      details: { command, ...details },
    })
  }

  /**
   * Log a permission change
   */
  async logPermissionChange(
    skillName: string,
    permission: string,
    granted: boolean
  ): Promise<void> {
    await this.log({
      action: granted ? 'permission:grant' : 'permission:revoke',
      skillName,
      success: true,
      details: { permission },
    })
  }

  /**
   * Log a security violation
   */
  async logSecurityViolation(
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: 'security:violation',
      success: false,
      details: { attemptedAction: action, ...details },
    })

    logger.warn('Security violation logged', { action, details })
  }

  /**
   * Get recent entries
   */
  getRecent(limit = 100): readonly AuditEntry[] {
    return this.entries.slice(-limit)
  }

  /**
   * Get entries by action
   */
  getByAction(action: string, limit = 100): readonly AuditEntry[] {
    return this.entries
      .filter((e) => e.action === action)
      .slice(-limit)
  }

  /**
   * Get entries by skill
   */
  getBySkill(skillName: string, limit = 100): readonly AuditEntry[] {
    return this.entries
      .filter((e) => e.skillName === skillName)
      .slice(-limit)
  }

  /**
   * Get failed entries
   */
  getFailed(limit = 100): readonly AuditEntry[] {
    return this.entries
      .filter((e) => !e.success)
      .slice(-limit)
  }

  /**
   * Get entries within a time range
   */
  getByTimeRange(start: Date, end: Date): readonly AuditEntry[] {
    return this.entries.filter(
      (e) => e.timestamp >= start && e.timestamp <= end
    )
  }

  /**
   * Clear all entries (useful for testing)
   */
  clear(): void {
    this.entries.length = 0
  }

  /**
   * Get entry count
   */
  getCount(): number {
    return this.entries.length
  }

  /**
   * Export entries to JSON
   */
  export(): string {
    return JSON.stringify(this.entries, null, 2)
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number
    successful: number
    failed: number
    byAction: Record<string, number>
  } {
    const stats = {
      total: this.entries.length,
      successful: 0,
      failed: 0,
      byAction: {} as Record<string, number>,
    }

    for (const entry of this.entries) {
      if (entry.success) {
        stats.successful++
      } else {
        stats.failed++
      }

      stats.byAction[entry.action] = (stats.byAction[entry.action] ?? 0) + 1
    }

    return stats
  }
}

// Singleton instance
let auditLogInstance: AuditLog | null = null

export function getAuditLog(): AuditLog {
  if (!auditLogInstance) {
    auditLogInstance = new AuditLog()
  }
  return auditLogInstance
}

export function initializeAuditLog(): AuditLog {
  return getAuditLog()
}
