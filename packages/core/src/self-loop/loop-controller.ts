/**
 * Self-Referential Loop - Loop Controller
 * 
 * Implements self-referential development loop for continuous
 * self-improvement and autonomous code optimization.
 */

import { createModuleLogger } from '@wqbot/logger'
import { EventEmitter } from 'events'

const logger = createModuleLogger('self-loop:controller')

// ============================================================================
// Types
// ============================================================================

export interface LoopConfig {
  maxIterations: number
  maxDuration: number           // Max total duration in ms
  convergenceThreshold: number  // Score change threshold to stop
  autoFixEnabled: boolean
  approvalRequired: boolean
  recordHistory: boolean
}

export interface LoopIteration {
  id: number
  phase: LoopPhase
  status: IterationStatus
  input: LoopInput
  output?: LoopOutput
  analysis?: LoopAnalysis
  score?: number
  duration: number
  timestamp: Date
  error?: string
}

export type LoopPhase = 'analyze' | 'plan' | 'execute' | 'verify' | 'improve' | 'complete'
export type IterationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface LoopInput {
  task: string
  context?: Record<string, unknown>
  constraints?: string[]
}

export interface LoopOutput {
  changes?: FileChange[]
  summary: string
  nextActions?: string[]
}

export interface FileChange {
  path: string
  operation: 'create' | 'modify' | 'delete'
  content?: string
  originalContent?: string
  diff?: string
}

export interface LoopAnalysis {
  issues: Issue[]
  quality: QualityMetrics
  suggestions: Suggestion[]
  score: number
}

export interface Issue {
  severity: 'critical' | 'high' | 'medium' | 'low'
  type: string
  description: string
  location?: {
    file: string
    line?: number
    column?: number
  }
  autoFixable: boolean
}

export interface QualityMetrics {
  correctness: number           // 0-100
  performance: number           // 0-100
  maintainability: number       // 0-100
  security: number             // 0-100
  testCoverage: number         // 0-100
}

export interface Suggestion {
  type: 'improvement' | 'refactor' | 'optimization' | 'fix'
  description: string
  effort: 'low' | 'medium' | 'high'
  impact: 'low' | 'medium' | 'high'
  autoFixable: boolean
}

export interface LoopSession {
  id: string
  config: LoopConfig
  iterations: LoopIteration[]
  currentPhase: LoopPhase
  status: SessionStatus
  startTime: Date
  endTime?: Date
  finalScore?: number
  improvements: Improvement[]
}

export type SessionStatus = 'initializing' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface Improvement {
  type: string
  description: string
  before?: unknown
  after?: unknown
  iteration: number
}

export interface LoopEvent {
  type: LoopEventType
  sessionId: string
  iteration?: number
  data?: unknown
  timestamp: Date
}

export type LoopEventType = 
  | 'session:started'
  | 'session:paused'
  | 'session:resumed'
  | 'session:completed'
  | 'session:failed'
  | 'session:cancelled'
  | 'iteration:started'
  | 'iteration:completed'
  | 'iteration:failed'
  | 'phase:changed'
  | 'score:updated'
  | 'improvement:applied'

// ============================================================================
// Loop Controller
// ============================================================================

export class SelfLoopController {
  private sessions: Map<string, LoopSession> = new Map()
  private emitter: EventEmitter
  private analyzers: Map<string, LoopAnalyzer> = new Map()
  private executors: Map<string, LoopExecutor> = new Map()

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(50)
    
    // Register default analyzers and executors
    this.registerDefaultComponents()
  }

  /**
   * Register default analyzers and executors
   */
  private registerDefaultComponents(): void {
    // Code analysis
    this.registerAnalyzer('code', async (input) => {
      return {
        issues: [],
        quality: {
          correctness: 80,
          performance: 75,
          maintainability: 70,
          security: 85,
          testCoverage: 60
        },
        suggestions: [],
        score: 74
      }
    })

    // Default executor
    this.registerExecutor('default', async (input, changes) => {
      logger.info(`Applying ${changes.length} changes`)
      return { success: true, applied: changes.length }
    })
  }

  /**
   * Register an analyzer
   */
  registerAnalyzer(name: string, analyzer: LoopAnalyzer): void {
    this.analyzers.set(name, analyzer)
    logger.info(`Registered analyzer: ${name}`)
  }

  /**
   * Register an executor
   */
  registerExecutor(name: string, executor: LoopExecutor): void {
    this.executors.set(name, executor)
    logger.info(`Registered executor: ${name}`)
  }

  /**
   * Start a self-improvement loop
   */
  async startLoop(input: LoopInput, config?: Partial<LoopConfig>): Promise<LoopSession> {
    const session: LoopSession = {
      id: `loop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      config: {
        maxIterations: config?.maxIterations ?? 10,
        maxDuration: config?.maxDuration ?? 600000, // 10 minutes
        convergenceThreshold: config?.convergenceThreshold ?? 5,
        autoFixEnabled: config?.autoFixEnabled ?? true,
        approvalRequired: config?.approvalRequired ?? false,
        recordHistory: config?.recordHistory ?? true
      },
      iterations: [],
      currentPhase: 'analyze',
      status: 'initializing',
      startTime: new Date(),
      improvements: []
    }

    this.sessions.set(session.id, session)
    session.status = 'running'

    this.emit({ type: 'session:started', sessionId: session.id })
    logger.info(`Started self-loop session: ${session.id}`)

    // Run the loop
    await this.runLoop(session, input)

    return session
  }

  /**
   * Run the self-improvement loop
   */
  private async runLoop(session: LoopSession, input: LoopInput): Promise<void> {
    const startTime = Date.now()
    let previousScore = 0

    try {
      for (let i = 0; i < session.config.maxIterations; i++) {
        // Check duration limit
        if (Date.now() - startTime > session.config.maxDuration) {
          logger.info('Max duration reached')
          break
        }

        const iteration: LoopIteration = {
          id: i + 1,
          phase: this.getNextPhase(session.currentPhase),
          status: 'running',
          input,
          duration: 0,
          timestamp: new Date()
        }

        session.iterations.push(iteration)
        session.currentPhase = iteration.phase

        this.emit({ 
          type: 'iteration:started', 
          sessionId: session.id,
          iteration: iteration.id 
        })

        // Execute phase
        await this.executePhase(session, iteration, input)

        // Check convergence
        if (iteration.score !== undefined) {
          const scoreChange = Math.abs(iteration.score - previousScore)
          
          if (scoreChange < session.config.convergenceThreshold) {
            logger.info(`Converged: score change ${scoreChange} < threshold`)
            break
          }
          
          previousScore = iteration.score
        }

        // Check if completed
        if (iteration.status === 'completed') {
          break
        }
      }

      // Mark session complete
      session.status = 'completed'
      session.endTime = new Date()
      session.finalScore = previousScore

      this.emit({ type: 'session:completed', sessionId: session.id })

    } catch (error) {
      session.status = 'failed'
      session.endTime = new Date()
      
      const err = error as Error
      logger.error(`Loop failed: ${err.message}`)
      
      this.emit({ 
        type: 'session:failed', 
        sessionId: session.id,
        data: { error: err.message }
      })
    }
  }

  /**
   * Execute a single phase
   */
  private async executePhase(
    session: LoopSession, 
    iteration: LoopIteration,
    input: LoopInput
  ): Promise<void> {
    const phaseStart = Date.now()

    try {
      switch (iteration.phase) {
        case 'analyze':
          iteration.analysis = await this.analyze(session, input)
          iteration.score = iteration.analysis.score
          iteration.status = 'completed'
          break

        case 'plan':
          // Generate improvement plan based on analysis
          iteration.output = {
            summary: 'Improvement plan generated',
            nextActions: iteration.analysis?.suggestions.slice(0, 3).map(s => s.description) || []
          }
          iteration.status = 'completed'
          break

        case 'execute':
          if (session.config.autoFixEnabled && iteration.analysis?.issues) {
            const fixable = iteration.analysis.issues.filter(i => i.autoFixable)
            
            if (fixable.length > 0) {
              const executor = this.executors.get('default')
              if (executor) {
                const changes = fixable.map(issue => ({
                  path: issue.location?.file || 'unknown',
                  operation: 'modify' as const,
                  description: issue.description
                }))
                
                await executor(input, changes)
                
                session.improvements.push({
                  type: 'auto-fix',
                  description: `Fixed ${fixable.length} issues`,
                  iteration: iteration.id
                })
              }
            }
          }
          
          iteration.output = {
            summary: 'Execution completed',
            changes: []
          }
          iteration.status = 'completed'
          break

        case 'verify':
          // Re-analyze to verify improvements
          iteration.analysis = await this.analyze(session, input)
          iteration.score = iteration.analysis.score
          iteration.status = 'completed'
          break

        case 'improve':
          // Apply additional improvements based on suggestions
          const suggestions = iteration.analysis?.suggestions.filter(s => s.autoFixable) || []
          
          if (suggestions.length > 0) {
            const executor = this.executors.get('default')
            if (executor) {
              const changes = suggestions.map(s => ({
                path: 'unknown',
                operation: 'modify' as const,
                description: s.description
              }))
              
              await executor(input, changes)
              
              session.improvements.push({
                type: 'improvement',
                description: `Applied ${suggestions.length} improvements`,
                iteration: iteration.id
              })
            }
          }
          
          iteration.output = { summary: 'Improvements applied' }
          iteration.status = 'completed'
          break

        case 'complete':
          iteration.status = 'completed'
          break
      }

      iteration.duration = Date.now() - phaseStart

      this.emit({ 
        type: 'iteration:completed', 
        sessionId: session.id,
        iteration: iteration.id,
        data: { score: iteration.score }
      })

    } catch (error) {
      iteration.status = 'failed'
      iteration.error = (error as Error).message
      iteration.duration = Date.now() - phaseStart

      this.emit({ 
        type: 'iteration:failed', 
        sessionId: session.id,
        iteration: iteration.id,
        data: { error: error }
      })
    }
  }

  /**
   * Analyze current state
   */
  private async analyze(session: LoopSession, input: LoopInput): Promise<LoopAnalysis> {
    const analyzer = this.analyzers.get('code')
    
    if (analyzer) {
      return await analyzer(input, session.improvements)
    }

    // Default analysis
    return {
      issues: [],
      quality: {
        correctness: 70,
        performance: 70,
        maintainability: 70,
        security: 70,
        testCoverage: 70
      },
      suggestions: [],
      score: 70
    }
  }

  /**
   * Get next phase
   */
  private getNextPhase(current: LoopPhase): LoopPhase {
    const phases: LoopPhase[] = ['analyze', 'plan', 'execute', 'verify', 'improve', 'complete']
    const currentIdx = phases.indexOf(current)
    return phases[Math.min(currentIdx + 1, phases.length - 1)]
  }

  /**
   * Pause a session
   */
  pauseLoop(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'running') return false

    session.status = 'paused'
    this.emit({ type: 'session:paused', sessionId })
    return true
  }

  /**
   * Resume a paused session
   */
  resumeLoop(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'paused') return false

    session.status = 'running'
    this.emit({ type: 'session:resumed', sessionId })
    return true
  }

  /**
   * Cancel a session
   */
  cancelLoop(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    session.status = 'cancelled'
    session.endTime = new Date()
    this.emit({ type: 'session:cancelled', sessionId })
    return true
  }

  /**
   * Get session status
   */
  getSession(sessionId: string): LoopSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get all sessions
   */
  getAllSessions(): LoopSession[] {
    return Array.from(this.sessions.values())
  }

  /**
   * Subscribe to loop events
   */
  on(event: LoopEventType, handler: (event: LoopEvent) => void): void {
    this.emitter.on(event, handler)
  }

  /**
   * Unsubscribe from loop events
   */
  off(event: LoopEventType, handler: (event: LoopEvent) => void): void {
    this.emitter.off(event, handler)
  }

  /**
   * Emit event
   */
  private emit(event: LoopEvent): void {
    event.timestamp = new Date()
    this.emitter.emit(event.type, event)
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

export type LoopAnalyzer = (
  input: LoopInput,
  improvements: Improvement[]
) => Promise<LoopAnalysis>

export type LoopExecutor = (
  input: LoopInput,
  changes: { path: string; operation: string; description?: string }[]
) => Promise<{ success: boolean; applied: number; error?: string }>

// ============================================================================
// Singleton
// ============================================================================

let controllerInstance: SelfLoopController | null = null

export function getLoopController(): SelfLoopController {
  if (!controllerInstance) {
    controllerInstance = new SelfLoopController()
  }
  return controllerInstance
}

export function createLoopController(): SelfLoopController {
  return new SelfLoopController()
}
