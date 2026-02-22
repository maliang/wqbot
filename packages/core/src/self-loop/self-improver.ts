/**
 * Self-Referential Loop - Self Improver
 * 
 * Handles self-improvement logic, learning from feedback,
 * and adapting based on outcomes.
 */

import { createModuleLogger } from '../logger'
import type { LoopSession, LoopIteration, LoopInput, QualityMetrics, Improvement } from './loop-controller.js'

const logger = createModuleLogger('self-loop:improver')

// ============================================================================
// Types
// ============================================================================

export interface LearningRecord {
  id: string
  timestamp: Date
  input: LoopInput
  output: unknown
  score: number
  feedback?: Feedback
  improvements: Improvement[]
}

export interface Feedback {
  type: 'explicit' | 'implicit' | 'automatic'
  rating?: number           // 1-5
  comment?: string
  issues?: string[]
}

export interface AdaptationRule {
  id: string
  trigger: string
  condition: string
  action: string
  confidence: number
  appliedCount: number
}

export interface ImprovementStrategy {
  name: string
  applicable: (metrics: QualityMetrics) => boolean
  priority: number
}

// ============================================================================
// Self Improver
// ============================================================================

export class SelfImprover {
  private learningHistory: LearningRecord[] = []
  private adaptationRules: AdaptationRule[] = []
  private strategies: ImprovementStrategy[] = []

  constructor() {
    this.registerDefaultStrategies()
  }

  /**
   * Register default improvement strategies
   */
  private registerDefaultStrategies(): void {
    this.strategies = [
      {
        name: 'improve-correctness',
        applicable: (m) => m.correctness < 70,
        priority: 1
      },
      {
        name: 'improve-performance',
        applicable: (m) => m.performance < 70,
        priority: 2
      },
      {
        name: 'improve-maintainability',
        applicable: (m) => m.maintainability < 70,
        priority: 3
      },
      {
        name: 'improve-security',
        applicable: (m) => m.security < 80,
        priority: 1
      },
      {
        name: 'improve-test-coverage',
        applicable: (m) => m.testCoverage < 70,
        priority: 4
      }
    ]
  }

  /**
   * Record an iteration for learning
   */
  async recordIteration(
    session: LoopSession,
    iteration: LoopIteration,
    output?: unknown
  ): Promise<void> {
    const record: LearningRecord = {
      id: `record-${Date.now()}`,
      timestamp: new Date(),
      input: iteration.input,
      output,
      score: iteration.score || 0,
      improvements: session.improvements
    }

    this.learningHistory.push(record)
    
    // Learn from this iteration
    await this.learn(record)

    // Prune old records if too many
    if (this.learningHistory.length > 1000) {
      this.learningHistory = this.learningHistory.slice(-500)
    }

    logger.info(`Recorded iteration ${iteration.id}, score: ${record.score}`)
  }

  /**
   * Learn from a learning record
   */
  private async learn(record: LearningRecord): Promise<void> {
    // Extract patterns and create adaptation rules
    if (record.improvements.length > 0) {
      for (const improvement of record.improvements) {
        // Create simple adaptation rules
        const existingRule = this.adaptationRules.find(
          r => r.trigger === improvement.type
        )

        if (existingRule) {
          existingRule.appliedCount++
          existingRule.confidence = Math.min(1, existingRule.appliedCount / 10)
        } else {
          this.adaptationRules.push({
            id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            trigger: improvement.type,
            condition: `improvement_type = "${improvement.type}"`,
            action: improvement.description,
            confidence: 0.1,
            appliedCount: 1
          })
        }
      }
    }
  }

  /**
   * Get feedback and update learning
   */
  async processFeedback(feedback: Feedback): Promise<void> {
    // Update confidence of recent rules based on feedback
    if (feedback.rating !== undefined) {
      const recent = this.learningHistory.slice(-10)
      
      for (const record of recent) {
        const adjustment = (feedback.rating - 3) * 0.1 // -0.2 to +0.2
        
        for (const rule of this.adaptationRules) {
          if (record.improvements.some(i => i.type === rule.trigger)) {
            rule.confidence = Math.max(0, Math.min(1, rule.confidence + adjustment))
          }
        }
      }
    }

    logger.info(`Processed feedback, rating: ${feedback.rating}`)
  }

  /**
   * Recommend improvements based on current state
   */
  recommendImprovements(metrics: QualityMetrics): ImprovementStrategy[] {
    return this.strategies
      .filter(s => s.applicable(metrics))
      .sort((a, b) => a.priority - b.priority)
  }

  /**
   * Get learned adaptation rules
   */
  getAdaptationRules(): AdaptationRule[] {
    return [...this.adaptationRules].sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Get learning history
   */
  getHistory(limit = 100): LearningRecord[] {
    return this.learningHistory.slice(-limit)
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRecords: number
    totalRules: number
    averageScore: number
    topRules: AdaptationRule[]
  } {
    const scores = this.learningHistory.map(r => r.score)
    const averageScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0

    return {
      totalRecords: this.learningHistory.length,
      totalRules: this.adaptationRules.length,
      averageScore,
      topRules: this.adaptationRules
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
    }
  }

  /**
   * Clear history (for privacy/reset)
   */
  clearHistory(): void {
    this.learningHistory = []
    logger.info('Cleared learning history')
  }

  /**
   * Export learned knowledge
   */
  exportKnowledge(): {
    rules: AdaptationRule[]
    stats: ReturnType<typeof this.getStats>
  } {
    return {
      rules: this.adaptationRules,
      stats: this.getStats()
    }
  }

  /**
   * Import knowledge
   */
  importKnowledge(knowledge: { rules: AdaptationRule[] }): void {
    for (const rule of knowledge.rules) {
      const existing = this.adaptationRules.find(r => r.id === rule.id)
      if (!existing) {
        this.adaptationRules.push(rule)
      }
    }
    logger.info(`Imported ${knowledge.rules.length} rules`)
  }
}

// ============================================================================
// Ralph-Ex Loop (Self-Referential Development Loop)
// ============================================================================

export interface RalphExConfig {
  maxIterations: number
  maxDuration: number
  selfReflect: boolean
  learnFromErrors: boolean
  autoOptimize: boolean
}

export interface RalphExResult {
  sessionId: string
  success: boolean
  finalScore: number
  iterations: number
  improvements: Improvement[]
  learnedRules: number
  duration: number
}

/**
 * Execute Ralph-Ex style self-referential development loop
 * This is similar to the ralphex command in some AI coding assistants
 */
export async function runRalphExLoop(
  input: LoopInput,
  config?: Partial<RalphExConfig>
): Promise<RalphExResult> {
  const { getLoopController } = await import('./loop-controller.js')
  const controller = getLoopController()
  const improver = new SelfImprover()

  const startTime = Date.now()

  // Start the loop
  const session = await controller.startLoop(input, {
    maxIterations: config?.maxIterations ?? 10,
    maxDuration: config?.maxDuration ?? 300000,
    autoFixEnabled: config?.autoOptimize ?? true,
    approvalRequired: false,
    convergenceThreshold: 3
  })

  // Wait for completion or timeout
  const checkInterval = 5000
  const maxWait = config?.maxDuration ?? 300000
  
  await new Promise<void>((resolve) => {
    const check = () => {
      const current = controller.getSession(session.id)
      if (!current || current.status === 'completed' || current.status === 'failed') {
        resolve()
      } else if (Date.now() - startTime > maxWait) {
        controller.cancelLoop(session.id)
        resolve()
      } else {
        setTimeout(check, checkInterval)
      }
    }
    check()
  })

  const finalSession = controller.getSession(session.id)
  const stats = improver.getStats()

  return {
    sessionId: session.id,
    success: finalSession?.status === 'completed',
    finalScore: finalSession?.finalScore || 0,
    iterations: finalSession?.iterations.length || 0,
    improvements: finalSession?.improvements || [],
    learnedRules: stats.totalRules,
    duration: Date.now() - startTime
  }
}

// ============================================================================
// Singleton
// ============================================================================

let improverInstance: SelfImprover | null = null

export function getSelfImprover(): SelfImprover {
  if (!improverInstance) {
    improverInstance = new SelfImprover()
  }
  return improverInstance
}

export function createSelfImprover(): SelfImprover {
  return new SelfImprover()
}
