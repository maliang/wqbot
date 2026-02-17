import { createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('audit-monitor')

/**
 * Audit log entry
 */
export interface AuditEntry {
  readonly id: string
  readonly timestamp: Date
  readonly action: string
  readonly category: 'tool' | 'model' | 'file' | 'session' | 'config' | 'security'
  readonly details: Record<string, unknown>
  readonly userId?: string
  readonly sessionId?: string
  readonly duration?: number
  readonly success: boolean
  readonly errorMessage?: string
}

/**
 * Token usage record
 */
export interface TokenUsage {
  readonly id: string
  readonly timestamp: Date
  readonly model: string
  readonly provider: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
  readonly cost?: number
  readonly sessionId?: string
}

/**
 * Cost tracking record
 */
export interface CostRecord {
  readonly id: string
  readonly timestamp: Date
  readonly type: 'model' | 'storage' | 'other'
  readonly description: string
  readonly amount: number
  readonly currency: string
  readonly sessionId?: string
}

/**
 * Usage statistics
 */
export interface UsageStatistics {
  readonly period: 'hour' | 'day' | 'week' | 'month'
  readonly startTime: Date
  readonly endTime: Date
  readonly totalRequests: number
  readonly totalTokens: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalCost: number
  readonly byModel: Record<string, { tokens: number; requests: number; cost: number }>
  readonly byProvider: Record<string, { tokens: number; requests: number; cost: number }>
}

/**
 * Model pricing configuration
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
  'claude-3-5-haiku-20241022': { input: 0.001, output: 0.005 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
}

/**
 * Audit and monitoring manager
 */
export class AuditMonitor {
  private readonly auditLog: AuditEntry[] = []
  private readonly tokenUsage: TokenUsage[] = []
  private readonly costRecords: CostRecord[] = []
  private readonly maxLogSize = 10000

  /**
   * Log an audit entry
   */
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const fullEntry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      ...entry,
    }

    this.auditLog.push(fullEntry)

    // Trim if too large
    if (this.auditLog.length > this.maxLogSize) {
      this.auditLog.shift()
    }

    logger.debug('Audit log entry', { action: entry.action, category: entry.category })
  }

  /**
   * Record token usage
   */
  recordTokenUsage(usage: Omit<TokenUsage, 'id' | 'timestamp' | 'totalTokens' | 'cost'>): TokenUsage {
    const totalTokens = usage.inputTokens + usage.outputTokens
    const cost = this.calculateCost(usage.model, usage.inputTokens, usage.outputTokens)

    const record: TokenUsage = {
      id: this.generateId(),
      timestamp: new Date(),
      totalTokens,
      cost,
      ...usage,
    }

    this.tokenUsage.push(record)

    // Trim if too large
    if (this.tokenUsage.length > this.maxLogSize) {
      this.tokenUsage.shift()
    }

    logger.debug('Token usage recorded', {
      model: usage.model,
      totalTokens,
      cost,
    })

    return record
  }

  /**
   * Record a cost
   */
  recordCost(record: Omit<CostRecord, 'id' | 'timestamp'>): CostRecord {
    const fullRecord: CostRecord = {
      id: this.generateId(),
      timestamp: new Date(),
      ...record,
    }

    this.costRecords.push(fullRecord)

    logger.debug('Cost recorded', { type: record.type, amount: record.amount })

    return fullRecord
  }

  /**
   * Calculate cost for model usage
   */
  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o-mini']

    const inputCost = (inputTokens / 1000) * pricing.input
    const outputCost = (outputTokens / 1000) * pricing.output

    return Number((inputCost + outputCost).toFixed(6))
  }

  /**
   * Get usage statistics for a period
   */
  getStatistics(period: 'hour' | 'day' | 'week' | 'month' = 'day'): UsageStatistics {
    const now = new Date()
    const startTime = this.getPeriodStart(now, period)

    // Filter records within period
    const periodUsage = this.tokenUsage.filter(u => u.timestamp >= startTime)
    const periodCosts = this.costRecords.filter(c => c.timestamp >= startTime)

    // Calculate totals
    const totalTokens = periodUsage.reduce((sum, u) => sum + u.totalTokens, 0)
    const inputTokens = periodUsage.reduce((sum, u) => sum + u.inputTokens, 0)
    const outputTokens = periodUsage.reduce((sum, u) => sum + u.outputTokens, 0)
    const modelCost = periodUsage.reduce((sum, u) => sum + (u.cost ?? 0), 0)
    const otherCost = periodCosts.reduce((sum, c) => sum + c.amount, 0)
    const totalCost = modelCost + otherCost

    // Group by model
    const byModel: Record<string, { tokens: number; requests: number; cost: number }> = {}
    for (const u of periodUsage) {
      if (!byModel[u.model]) {
        byModel[u.model] = { tokens: 0, requests: 0, cost: 0 }
      }
      byModel[u.model].tokens += u.totalTokens
      byModel[u.model].requests += 1
      byModel[u.model].cost += u.cost ?? 0
    }

    // Group by provider
    const byProvider: Record<string, { tokens: number; requests: number; cost: number }> = {}
    for (const u of periodUsage) {
      if (!byProvider[u.provider]) {
        byProvider[u.provider] = { tokens: 0, requests: 0, cost: 0 }
      }
      byProvider[u.provider].tokens += u.totalTokens
      byProvider[u.provider].requests += 1
      byProvider[u.provider].cost += u.cost ?? 0
    }

    return {
      period,
      startTime,
      endTime: now,
      totalRequests: periodUsage.length,
      totalTokens,
      inputTokens,
      outputTokens,
      totalCost,
      byModel,
      byProvider,
    }
  }

  /**
   * Get period start time
   */
  private getPeriodStart(now: Date, period: 'hour' | 'day' | 'week' | 'month'): Date {
    const start = new Date(now)

    switch (period) {
      case 'hour':
        start.setHours(start.getHours() - 1, 0, 0, 0)
        break
      case 'day':
        start.setHours(0, 0, 0, 0)
        break
      case 'week':
        start.setDate(start.getDate() - 7)
        start.setHours(0, 0, 0, 0)
        break
      case 'month':
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        break
    }

    return start
  }

  /**
   * Get audit log entries
   */
  getAuditLog(options?: {
    category?: AuditEntry['category']
    sessionId?: string
    limit?: number
  }): AuditEntry[] {
    let entries = [...this.auditLog]

    if (options?.category) {
      entries = entries.filter(e => e.category === options.category)
    }

    if (options?.sessionId) {
      entries = entries.filter(e => e.sessionId === options.sessionId)
    }

    if (options?.limit) {
      entries = entries.slice(-options.limit)
    }

    return entries
  }

  /**
   * Get token usage records
   */
  getTokenUsage(options?: {
    model?: string
    sessionId?: string
    limit?: number
  }): TokenUsage[] {
    let records = [...this.tokenUsage]

    if (options?.model) {
      records = records.filter(r => r.model === options.model)
    }

    if (options?.sessionId) {
      records = records.filter(r => r.sessionId === options.sessionId)
    }

    if (options?.limit) {
      records = records.slice(-options.limit)
    }

    return records
  }

  /**
   * Export data for external analysis
   */
  export(): {
    auditLog: AuditEntry[]
    tokenUsage: TokenUsage[]
    costRecords: CostRecord[]
  } {
    return {
      auditLog: [...this.auditLog],
      tokenUsage: [...this.tokenUsage],
      costRecords: [...this.costRecords],
    }
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.auditLog.length = 0
    this.tokenUsage.length = 0
    this.costRecords.length = 0
    logger.info('Audit records cleared')
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}

// Singleton
let monitorInstance: AuditMonitor | null = null

export function getAuditMonitor(): AuditMonitor {
  if (!monitorInstance) {
    monitorInstance = new AuditMonitor()
  }
  return monitorInstance
}

export function initializeAuditMonitor(): AuditMonitor {
  return getAuditMonitor()
}

// Convenience functions
export function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
  getAuditMonitor().log(entry)
}

export function recordTokens(usage: Omit<TokenUsage, 'id' | 'timestamp' | 'totalTokens' | 'cost'>): TokenUsage {
  return getAuditMonitor().recordTokenUsage(usage)
}

export function getUsageStats(period?: 'hour' | 'day' | 'week' | 'month'): UsageStatistics {
  return getAuditMonitor().getStatistics(period)
}
