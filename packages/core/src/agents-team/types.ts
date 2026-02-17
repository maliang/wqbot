/**
 * Agents Team - Types
 * 
 * Type definitions for multi-agent team collaboration.
 */

import type { Agent } from '@wqbot/skills'

// Re-export from team-manager
export {
  type AgentRole,
  type TeamMember,
  type MemberStatus,
  type Team,
  type TeamMode,
  type TeamConfig,
  type TeamTask,
  type TaskStatus,
  type TaskPriority,
  type TaskResult,
  type TeamMessage,
  type MessageType,
  type TeamEvent,
  type TeamEventType,
  TEAM_TEMPLATES
} from './team-manager.js'

export {
  type CollaborationSession,
  type CollaborationMode,
  type SessionStatus,
  type CollaborationPhase,
  type CollaborationResult,
  type AgentExecutionContext,
  type AgentExecutor
} from './collaboration-engine.js'

// Team creation options
export interface CreateTeamOptions {
  name: string
  description?: string
  members: TeamMemberConfig[]
  mode?: TeamMode
  config?: Partial<TeamConfig>
}

export interface TeamMemberConfig {
  name: string
  role: AgentRole
  agent: Agent
  capabilities: string[]
}

// Collaboration request
export interface CollaborationRequest {
  teamId?: string              // Use existing team
  template?: keyof typeof TEAM_TEMPLATES  // Use template
  tasks: CollaborationTask[]
  mode?: CollaborationMode
  options?: {
    timeout?: number
    onProgress?: (progress: CollaborationProgress) => void
  }
}

export interface CollaborationTask {
  title: string
  description?: string
  priority?: TaskPriority
  input?: unknown
}

export interface CollaborationProgress {
  phase: string
  completedTasks: number
  totalTasks: number
  currentTask?: string
  results?: CollaborationResult[]
}

// CLI commands
export interface TeamCLICommands {
  list: () => Promise<Team[]>
  create: (name: string, template?: string) => Promise<Team>
  dissolve: (teamId: string) => Promise<void>
  add: (teamId: string, member: TeamMemberConfig) => Promise<void>
  remove: (teamId: string, memberId: string) => Promise<void>
  assign: (teamId: string, taskId: string, memberId: string) => Promise<void>
  status: (teamId: string) => Promise<TeamStatus>
  collaborate: (request: CollaborationRequest) => Promise<CollaborationSession>
}

export interface TeamStatus {
  team: Team
  stats: {
    totalTasks: number
    completedTasks: number
    failedTasks: number
    pendingTasks: number
    memberLoad: Record<string, number>
  }
  activeSessions: CollaborationSession[]
}
