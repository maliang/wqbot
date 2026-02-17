/**
 * Agents Team - Team Manager
 * 
 * Manages multi-agent teams with role assignment,
 * task distribution, and collaboration patterns.
 */

import { createModuleLogger } from '@wqbot/logger'
import { EventEmitter } from 'events'
import type { Agent } from '@wqbot/skills'

const logger = createModuleLogger('agents-team:manager')

// ============================================================================
// Types
// ============================================================================

export type AgentRole = 'leader' | 'worker' | 'reviewer' | 'coordinator' | 'specialist'

export interface TeamMember {
  id: string
  name: string
  role: AgentRole
  agent: Agent
  status: MemberStatus
  capabilities: string[]
  load: number           // Current task load (0-100)
  assignedTasks: string[]
  completedTasks: string[]
}

export type MemberStatus = 'idle' | 'active' | 'busy' | 'offline'

export interface Team {
  id: string
  name: string
  description?: string
  members: TeamMember[]
  mode: TeamMode
  createdAt: Date
  updatedAt: Date
  config: TeamConfig
}

export type TeamMode = 'parallel' | 'sequential' | 'hierarchical' | 'brainstorm'

export interface TeamConfig {
  maxParallelTasks: number
  requireLeaderApproval: boolean
  autoBalanceLoad: boolean
  conflictResolution: 'leader-decides' | 'vote' | 'human-review'
  communicationPattern: 'direct' | 'relay' | 'broadcast'
  maxIterations: number
  timeoutPerTask: number
}

export interface TeamTask {
  id: string
  title: string
  description?: string
  assignee?: string        // Member ID
  status: TaskStatus
  priority: TaskPriority
  dependencies: string[]   // Task IDs this depends on
  input: unknown
  output?: unknown
  result?: TaskResult
  iterations: number
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
}

export type TaskStatus = 'pending' | 'assigned' | ' 'reviewin_progress' |' | 'completed' | 'failed'
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'

export interface TaskResult {
  success: boolean
  output?: unknown
  error?: string
  duration: number
  reviewedBy?: string
  approvalStatus?: 'approved' | 'rejected' | 'pending'
}

export interface TeamMessage {
  id: string
  from: string             // Member ID
  to: string | '*'        // Member ID or broadcast
  type: MessageType
  content: string
  attachments?: unknown[]
  timestamp: Date
  read: boolean
}

export type MessageType = 'task' | 'status' | 'request' | 'response' | 'alert' | 'approval'

export interface TeamEvent {
  type: TeamEventType
  teamId: string
  memberId?: string
  taskId?: string
  data?: unknown
  timestamp: Date
}

export type TeamEventType = 
  | 'team:created'
  | 'team:dissolved'
  | 'member:joined'
  | 'member:left'
  | 'member:status-changed'
  | 'task:assigned'
  | 'task:completed'
  | 'task:failed'
  | 'task:review-requested'
  | 'message:received'
  | 'collaboration:started'
  | 'collaboration:completed'

// ============================================================================
// Team Manager
// ============================================================================

export class TeamManager {
  private teams: Map<string, Team> = new Map()
  private tasks: Map<string, TeamTask> = new Map()
  private messages: Map<string, TeamMessage[]> = new Map()
  private emitter: EventEmitter

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(100)
  }

  /**
   * Create a new team
   */
  createTeam(
    name: string,
    members: Omit<TeamMember, 'id' | 'status' | 'load' | 'assignedTasks' | 'completedTasks'>[],
    config?: Partial<TeamConfig>,
    description?: string
  ): Team {
    const id = `team-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    
    const team: Team = {
      id,
      name,
      description,
      members: members.map(m => ({
        ...m,
        id: `member-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: 'idle',
        load: 0,
        assignedTasks: [],
        completedTasks: []
      })),
      mode: 'parallel',
      createdAt: new Date(),
      updatedAt: new Date(),
      config: {
        maxParallelTasks: config?.maxParallelTasks ?? 5,
        requireLeaderApproval: config?.requireLeaderApproval ?? false,
        autoBalanceLoad: config?.autoBalanceLoad ?? true,
        conflictResolution: config?.conflictResolution ?? 'leader-decides',
        communicationPattern: config?.communicationPattern ?? 'direct',
        maxIterations: config?.maxIterations ?? 10,
        timeoutPerTask: config?.timeoutPerTask ?? 300000
      }
    }

    this.teams.set(id, team)
    this.messages.set(id, [])

    this.emit({ type: 'team:created', teamId: id })
    logger.info(`Created team: ${name} (${id})`)

    return team
  }

  /**
   * Get team by ID
   */
  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId)
  }

  /**
   * Get all teams
   */
  getAllTeams(): Team[] {
    return Array.from(this.teams.values())
  }

  /**
   * Dissolve a team
   */
  dissolveTeam(teamId: string): boolean {
    const team = this.teams.get(teamId)
    if (!team) return false

    this.teams.delete(teamId)
    this.messages.delete(teamId)

    this.emit({ type: 'team:dissolved', teamId })
    logger.info(`Dissolved team: ${team.name}`)
    return true
  }

  /**
   * Add member to team
   */
  addMember(
    teamId: string,
    member: Omit<TeamMember, 'id' | 'status' | 'load' | 'assignedTasks' | 'completedTasks'>
  ): TeamMember | undefined {
    const team = this.teams.get(teamId)
    if (!team) return undefined

    const newMember: TeamMember = {
      ...member,
      id: `member-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: 'idle',
      load: 0,
      assignedTasks: [],
      completedTasks: []
    }

    team.members.push(newMember)
    team.updatedAt = new Date()

    this.emit({ type: 'member:joined', teamId, memberId: newMember.id })
    logger.info(`Added member ${member.name} to team ${team.name}`)

    return newMember
  }

  /**
   * Remove member from team
   */
  removeMember(teamId: string, memberId: string): boolean {
    const team = this.teams.get(teamId)
    if (!team) return false

    const index = team.members.findIndex(m => m.id === memberId)
    if (index === -1) return false

    const member = team.members[index]
    team.members.splice(index, 1)
    team.updatedAt = new Date()

    this.emit({ type: 'member:left', teamId, memberId })
    logger.info(`Removed member ${member.name} from team ${team.name}`)

    return true
  }

  /**
   * Create a task for the team
   */
  createTask(
    teamId: string,
    title: string,
    options?: {
      description?: string
      priority?: TaskPriority
      input?: unknown
      dependencies?: string[]
    }
  ): TeamTask | undefined {
    const team = this.teams.get(teamId)
    if (!team) return undefined

    const task: TeamTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      description: options?.description,
      status: 'pending',
      priority: options?.priority ?? 'normal',
      dependencies: options?.dependencies || [],
      input: options?.input,
      iterations: 0,
      createdAt: new Date()
    }

    this.tasks.set(task.id, task)

    logger.info(`Created task: ${title} for team ${team.name}`)
    return task
  }

  /**
   * Assign task to member
   */
  assignTask(taskId: string, memberId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false

    const team = Array.from(this.teams.values()).find(t => 
      t.members.some(m => m.id === memberId)
    )
    if (!team) return false

    const member = team.members.find(m => m.id === memberId)
    if (!member) return false

    // Check dependencies
    const unmetDeps = task.dependencies.filter(depId => {
      const dep = this.tasks.get(depId)
      return !dep || dep.status !== 'completed'
    })

    if (unmetDeps.length > 0) {
      logger.warn(`Task ${taskId} has unmet dependencies: ${unmetDeps.join(', ')}`)
      return false
    }

    task.assignee = memberId
    task.status = 'assigned'
    member.assignedTasks.push(taskId)
    member.load = Math.min(100, member.load + 20)

    this.emit({ type: 'task:assigned', teamId: team.id, taskId, memberId })
    logger.info(`Assigned task ${task.title} to ${member.name}`)

    return true
  }

  /**
   * Auto-balance tasks across team
   */
  autoBalanceTasks(teamId: string): void {
    const team = this.teams.get(teamId)
    if (!team || !team.config.autoBalanceLoad) return

    const pendingTasks = Array.from(this.tasks.values())
      .filter(t => t.status === 'pending')
    
    const availableMembers = team.members
      .filter(m => m.status !== 'offline')
      .sort((a, b) => a.load - b.load)

    for (const task of pendingTasks) {
      const assignee = availableMembers.find(m => m.load < 80)
      if (assignee) {
        this.assignTask(task.id, assignee.id)
        assignee.load = Math.min(100, assignee.load + 20)
      }
    }
  }

  /**
   * Complete task
   */
  completeTask(taskId: string, result: TaskResult): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false

    task.status = result.success ? 'completed' : 'failed'
    task.result = result
    task.completedAt = new Date()

    if (task.assignee) {
      const team = Array.from(this.teams.values()).find(t =>
        t.members.some(m => m.id === task.assignee)
      )
      if (team) {
        const member = team.members.find(m => m.id === task.assignee)
        if (member) {
          member.load = Math.max(0, member.load - 20)
          member.completedTasks.push(taskId)
        }
      }
    }

    const teamId = Array.from(this.teams.entries())
      .find(([_, t]) => t.members.some(m => m.id === task.assignee))?.[0]

    if (teamId) {
      this.emit({ 
        type: result.success ? 'task:completed' : 'task:failed', 
        teamId, 
        taskId 
      })
    }

    logger.info(`Task ${task.title} ${result.success ? 'completed' : 'failed'}`)
    return true
  }

  /**
   * Send message between members
   */
  sendMessage(
    teamId: string,
    fromMemberId: string,
    toMemberId: string | '*',
    type: MessageType,
    content: string,
    attachments?: unknown[]
  ): TeamMessage | undefined {
    const team = this.teams.get(teamId)
    if (!team) return undefined

    const message: TeamMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: fromMemberId,
      to: toMemberId,
      type,
      content,
      attachments,
      timestamp: new Date(),
      read: false
    }

    const messages = this.messages.get(teamId)
    messages?.push(message)

    this.emit({ type: 'message:received', teamId, memberId: fromMemberId })
    logger.debug(`Message from ${fromMemberId} to ${toMemberId}`)

    return message
  }

  /**
   * Get team messages
   */
  getMessages(teamId: string, memberId?: string): TeamMessage[] {
    const messages = this.messages.get(teamId) || []
    
    if (memberId) {
      return messages.filter(m => 
        m.from === memberId || m.to === memberId || m.to === '*'
      )
    }
    
    return messages
  }

  /**
   * Get team statistics
   */
  getTeamStats(teamId: string): {
    totalTasks: number
    completedTasks: number
    failedTasks: number
    pendingTasks: number
    memberLoad: Record<string, number>
  } | undefined {
    const team = this.teams.get(teamId)
    if (!team) return undefined

    const teamTasks = Array.from(this.tasks.values())
      .filter(t => team.members.some(m => 
        m.assignedTasks.includes(t.id) || m.completedTasks.includes(t.id)
      ))

    return {
      totalTasks: teamTasks.length,
      completedTasks: teamTasks.filter(t => t.status === 'completed').length,
      failedTasks: teamTasks.filter(t => t.status === 'failed').length,
      pendingTasks: teamTasks.filter(t => t.status === 'pending' || t.status === 'assigned').length,
      memberLoad: Object.fromEntries(
        team.members.map(m => [m.name, m.load])
      )
    }
  }

  /**
   * Subscribe to team events
   */
  on(event: TeamEventType, handler: (event: TeamEvent) => void): void {
    this.emitter.on(event, handler)
  }

  /**
   * Unsubscribe from team events
   */
  off(event: TeamEventType, handler: (event: TeamEvent) => void): void {
    this.emitter.off(event, handler)
  }

  /**
   * Emit team event
   */
  private emit(event: TeamEvent): void {
    event.timestamp = new Date()
    this.emitter.emit(event.type, event)
  }
}

// ============================================================================
// Built-in Team Templates
// ============================================================================

export const TEAM_TEMPLATES = {
  codeReview: {
    name: 'Code Review Team',
    description: 'Multi-agent code review with parallel checking',
    roles:      { name [
: 'lead', role: 'leader', capabilities: ['review', 'approve'] },
      { name: 'syntax-checker', role: 'specialist', capabilities: ['lint', 'typecheck'] },
      { name: 'security-checker', role: 'specialist', capabilities: ['security-scan'] },
      { name: 'style-checker', role: 'specialist', capabilities: ['format-check'] }
    ],
    mode: 'parallel' as TeamMode,
    config: {
      requireLeaderApproval: true,
      autoBalanceLoad: true,
      maxParallelTasks: 4
    }
  },

  development: {
    name: 'Development Team',
    description: 'Full-stack development with TDD workflow',
    roles: [
      { name: 'architect', role: 'coordinator', capabilities: ['design', 'review'] },
      { name: 'developer', role: 'worker', capabilities: ['implement', 'test'] },
      { name: 'tester', role: 'reviewer', capabilities: ['test', 'verify'] }
    ],
    mode: 'sequential' as TeamMode,
    config: {
      requireLeaderApproval: false,
      autoBalanceLoad: true,
      maxIterations: 5
    }
  },

  brainstorming: {
    name: 'Brainstorming Team',
    description: 'Creative problem-solving session',
    roles: [
      { name: 'facilitator', role: 'leader', capabilities: ['moderate', 'synthesize'] },
      { name: 'idea-generator-1', role: 'worker', capabilities: ['creative', 'ideate'] },
      { name: 'idea-generator-2', role: 'worker', capabilities: ['creative', 'ideate'] },
      { name: 'critic', role: 'reviewer', capabilities: ['analyze', 'evaluate'] }
    ],
    mode: 'brainstorm' as TeamMode,
    config: {
      requireLeaderApproval: false,
      autoBalanceLoad: false,
      maxIterations: 3
    }
  }
} as const

// ============================================================================
// Singleton
// ============================================================================

let teamManagerInstance: TeamManager | null = null

export function getTeamManager(): TeamManager {
  if (!teamManagerInstance) {
    teamManagerInstance = new TeamManager()
  }
  return teamManagerInstance
}

export function createTeamManager(): TeamManager {
  return new TeamManager()
}
