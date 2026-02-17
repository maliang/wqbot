/**
 * Agents Team - Collaboration Engine
 * 
 * Handles inter-agent communication, collaboration patterns,
 * and task coordination for multi-agent workflows.
 */

import { createModuleLogger } from '@wqbot/logger'
import { EventEmitter } from 'events'
import type { Team, TeamMember, TeamTask, TeamMessage, TeamConfig, TaskResult } from './team-manager.js'

const logger = createModuleLogger('agents-team:collaboration')

export interface CollaborationSession {
  id: string
  teamId: string
  mode: CollaborationMode
  tasks: string[]           // Task IDs
  currentPhase: number
  phases: CollaborationPhase[]
  status: SessionStatus
  startedAt: Date
  completedAt?: Date
  results: CollaborationResult[]
}

export type CollaborationMode = 'parallel' | 'sequential' | 'iterative' | 'debate'
export type SessionStatus = 'initializing' | 'running' | 'paused' | 'completed' | 'failed'

export interface CollaborationPhase {
  name: string
  type: 'execution' | 'review' | 'discussion' | 'voting'
  participants: string[]   // Member IDs
  duration?: number        // Max duration in ms
  completed: boolean
}

export interface CollaborationResult {
  taskId: string
  output: unknown
  success: boolean
  duration: number
  iterations: number
}

export interface AgentExecutionContext {
  member: TeamMember
  task: TeamTask
  team: Team
  session: CollaborationSession
}

export type AgentExecutor = (context: AgentExecutionContext) => Promise<TaskResult>

export class CollaborationEngine {
  private sessions: Map<string, CollaborationSession> = new Map()
  private executors: Map<string, AgentExecutor> = new Map()
  private emitter: EventEmitter

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(50)
  }

  /**
   * Register an agent executor
   */
  registerExecutor(memberRole: string, executor: AgentExecutor): void {
    this.executors.set(memberRole, executor)
    logger.info(`Registered executor for role: ${memberRole}`)
  }

  /**
   * Start a collaboration session
   */
  async startSession(
    team: Team,
    tasks: Omit<TeamTask, 'id' | 'status' | 'iterations' | 'createdAt'>[],
    mode: CollaborationMode = 'parallel'
  ): Promise<CollaborationSession> {
    const session: CollaborationSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      teamId: team.id,
      mode,
      tasks: [],
      currentPhase: 0,
      phases: this.generatePhases(team, mode),
      status: 'initializing',
      startedAt: new Date(),
      results: []
    }

    // Create tasks
    for (const task of tasks) {
      const fullTask: TeamTask = {
        ...task,
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: 'pending',
        iterations: 0,
        createdAt: new Date()
      }
      session.tasks.push(fullTask.id)
    }

    this.sessions.set(session.id, session)
    session.status = 'running'

    logger.info(`Started collaboration session: ${session.id} (${mode})`)

    // Execute based on mode
    await this.executeSession(session, team)

    return session
  }

  /**
   * Execute collaboration session
   */
  private async executeSession(session: CollaborationSession, team: Team): Promise<void> {
    try {
      switch (session.mode) {
        case 'parallel':
          await this.executeParallel(session, team)
          break
        case 'sequential':
          await this.executeSequential(session, team)
          break
        case 'iterative':
          await this.executeIterative(session, team)
          break
        case 'debate':
          await this.executeDebate(session, team)
          break
      }

      session.status = 'completed'
      session.completedAt = new Date()
      logger.info(`Collaboration session completed: ${session.id}`)

    } catch (error) {
      session.status = 'failed'
      session.completedAt = new Date()
      logger.error(`Collaboration session failed: ${error}`)
    }
  }

  /**
   * Execute tasks in parallel
   */
  private async executeParallel(session: CollaborationSession, team: Team): Promise<void> {
    const tasks = session.tasks
    const members = team.members.filter(m => m.status !== 'offline')
    const maxParallel = Math.min(team.config.maxParallelTasks, members.length)

    // Assign tasks to members
    const assignments: Map<string, string[]> = new Map()
    tasks.forEach((taskId, idx) => {
      const memberId = members[idx % maxParallel].id
      if (!assignments.has(memberId)) {
        assignments.set(memberId, [])
      }
      assignments.get(memberId)!.push(taskId)
    })

    // Execute in parallel batches
    const batches: string[][] = []
    let currentBatch: string[] = []
    
    for (const [, taskIds] of assignments) {
      for (const taskId of taskIds) {
        currentBatch.push(taskId)
        if (currentBatch.length >= maxParallel) {
          batches.push(currentBatch)
          currentBatch = []
        }
      }
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch)
    }

    for (const batch of batches) {
      await Promise.all(
        batch.map(taskId => this.executeTask(taskId, team, session))
      )
    }
  }

  /**
   * Execute tasks sequentially
   */
  private async executeSequential(session: CollaborationSession, team: Team): Promise<void> {
    for (const taskId of session.tasks) {
      await this.executeTask(taskId, team, session)
    }
  }

  /**
   * Execute tasks iteratively with review
   */
  private async executeIterative(session: CollaborationSession, team: Team): Promise<void> {
    const leader = team.members.find(m => m.role === 'leader')
    const reviewers = team.members.filter(m => m.role === 'reviewer')

    for (const taskId of session.tasks) {
      let iterations = 0
      let approved = false

      while (iterations < team.config.maxIterations && !approved) {
        // Execute task
        const result = await this.executeTask(taskId, team, session)
        
        if (!result.success) {
          break
        }

        // Review if reviewers available
        if (reviewers.length > 0) {
          const reviewResult = await this.runReview(taskId, reviewers, team)
          
          if (reviewResult.approved) {
            approved = true
          } else {
            // Request revisions
            iterations++
          }
        } else if (leader) {
          // Fall back to leader approval
          approved = team.config.requireLeaderApproval ? false : true
        } else {
          approved = true
        }
      }
    }
  }

  /**
   * Execute debate mode (multiple agents propose, then vote)
   */
  private async executeDebate(session: CollaborationSession, team: Team): Promise<void> {
    const facilitators = team.members.filter(m => m.role === 'leader' || m.role === 'coordinator')
    const proposers = team.members.filter(m => m.role === 'worker')
    const judges = team.members.filter(m => m.role === 'reviewer')

    for (const taskId of session.tasks) {
      // Phase 1: Proposers present solutions
      const proposals = await Promise.all(
        proposers.map(proposer => this.executeTask(taskId, team, session))
      )

      // Phase 2: Judges evaluate
      if (judges.length > 0) {
        const evaluations = await Promise.all(
          judges.map(judge => this.evaluateProposals(taskId, proposals, team))
        )

        // Phase 3: Facilitator synthesizes
        if (facilitators.length > 0) {
          this.synthesizeResults(taskId, proposals, evaluations, session)
        }
      }
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(taskId: string, team: Team, session: CollaborationSession): Promise<TaskResult> {
    const startTime = Date.now()

    // Find available member
    const member = team.members
      .filter(m => m.status !== 'offline')
      .sort((a, b) => a.load - b.load)[0]

    if (!member) {
      return { success: false, error: 'No available members', duration: 0 }
    }

    // Get executor for role
    const executor = this.executors.get(member.role)
    if (!executor) {
      return { success: false, error: `No executor for role: ${member.role}`, duration: 0 }
    }

    // Create context
    const task = {
      id: taskId,
      title: '',
      status: 'assigned' as const,
      priority: 'normal' as const,
      iterations: 0,
      createdAt: new Date()
    }

    const context: AgentExecutionContext = {
      member,
      task,
      team,
      session
    }

    try {
      member.status = 'busy'
      const result = await Promise.race([
        executor(context),
        this.timeout(team.config.timeoutPerTask)
      ])

      member.status = 'idle'
      member.load = Math.max(0, member.load - 10)

      session.results.push({
        taskId,
        output: result.output,
        success: result.success,
        duration: Date.now() - startTime,
        iterations: task.iterations
      })

      return result

    } catch (error) {
      member.status = 'idle'
      const err = error as Error
      
      return {
        success: false,
        error: err.message,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Run review phase
   */
  private async runReview(taskId: string, reviewers: TeamMember[], team: Team): Promise<{
    approved: boolean
    feedback: string
  }> {
    // Simplified review - in production, would invoke actual review agents
    return {
      approved: true,
      feedback: 'Approved'
    }
  }

  /**
   * Evaluate proposals
   */
  private async evaluateProposals(
    taskId: string, 
    proposals: TaskResult[], 
    team: Team
  ): Promise<{ scores: number[]; winner: number }> {
    // Simplified voting
    const scores = proposals.map(p => p.success ? 1 : 0)
    const winner = scores.indexOf(Math.max(...scores))
    return { scores, winner }
  }

  /**
   * Synthesize debate results
   */
  private synthesizeResults(
    taskId: string, 
    proposals: TaskResult[], 
    evaluations: { winner: number }[], 
    session: CollaborationSession
  ): void {
    const winnerIdx = evaluations[0]?.winner ?? 0
    const winningProposal = proposals[winnerIdx]

    session.results.push({
      taskId,
      output: winningProposal.output,
      success: winningProposal.success,
      duration: 0,
      iterations: 1
    })
  }

  /**
   * Generate collaboration phases
   */
  private generatePhases(team: Team, mode: CollaborationMode): CollaborationPhase[] {
    switch (mode) {
      case 'parallel':
        return [
          { name: 'execution', type: 'execution', participants: team.members.map(m => m.id), completed: false }
        ]
      case 'sequential':
        return team.members.map((m, i) => ({
          name: `phase-${i + 1}`,
          type: 'execution' as const,
          participants: [m.id],
          completed: false
        }))
      case 'iterative':
        return [
          { name: 'execution', type: 'execution', participants: team.members.map(m => m.id), completed: false },
          { name: 'review', type: 'review', participants: team.members.filter(m => m.role === 'reviewer').map(m => m.id), completed: false },
          { name: 'discussion', type: 'discussion', participants: team.members.map(m => m.id), completed: false }
        ]
      case 'debate':
        return [
          { name: 'proposals', type: 'execution', participants: team.members.filter(m => m.role === 'worker').map(m => m.id), completed: false },
          { name: 'evaluation', type: 'voting', participants: team.members.filter(m => m.role === 'reviewer').map(m => m.id), completed: false },
          { name: 'synthesis', type: 'discussion', participants: team.members.filter(m => m.role === 'leader').map(m => m.id), completed: false }
        ]
      default:
        return []
    }
  }

  /**
   * Timeout helper
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Task timed out after ${ms}ms`)), ms)
    )
  }

  /**
   * Get session
   */
  getSession(sessionId: string): CollaborationSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get all sessions
   */
  getAllSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values())
  }
}

// ============================================================================
// Singleton
// ============================================================================

let engineInstance: CollaborationEngine | null = null

export function getCollaborationEngine(): CollaborationEngine {
  if (!engineInstance) {
    engineInstance = new CollaborationEngine()
  }
  return engineInstance
}

export function createCollaborationEngine(): CollaborationEngine {
  return new CollaborationEngine()
}
