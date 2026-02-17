/**
 * Agents Team - Entry Point
 * 
 * Multi-agent team collaboration system.
 */

export {
  TeamManager,
  getTeamManager,
  createTeamManager,
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
  CollaborationEngine,
  getCollaborationEngine,
  createCollaborationEngine,
  type CollaborationSession,
  type CollaborationMode,
  type SessionStatus,
  type CollaborationPhase,
  type CollaborationResult,
  type AgentExecutionContext,
  type AgentExecutor
} from './collaboration-engine.js'

export {
  type CreateTeamOptions,
  type TeamMemberConfig,
  type CollaborationRequest,
  type CollaborationTask,
  type CollaborationProgress,
  type TeamCLICommands,
  type TeamStatus
} from './types.js'

// Convenience function to create a team from template
export async function createTeamFromTemplate(
  templateName: keyof typeof TEAM_TEMPLATES,
  agents: { name: string; agent: any }[]
): Promise<Team> {
  const { getTeamManager } = await import('./team-manager.js')
  const manager = getTeamManager()
  
  const template = TEAM_TEMPLATES[templateName]
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`)
  }

  const members = template.roles.map((role, idx) => ({
    name: agents[idx]?.name || role.name,
    role: role.role as AgentRole,
    agent: agents[idx]?.agent || {},
    capabilities: role.capabilities
  }))

  return manager.createTeam(
    template.name,
    members,
    template.config,
    template.description
  )
}
