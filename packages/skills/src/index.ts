export { BaseSkill, type SkillExecuteParams } from './base-skill.js'
export { SkillRegistry, getSkillRegistry, initializeSkillRegistry } from './skill-registry.js'
export {
  SkillMarketplace,
  getSkillMarketplace,
  type RemoteSkill,
  type InstalledSkill,
  type SkillSource,
} from './skill-marketplace.js'
export {
  ToolRegistry,
  getToolRegistry,
  type ToolDefinition,
  type ToolResult,
} from './tool-registry.js'
export {
  MCPClientManager,
  getMCPClientManager,
  initializeMCPClient,
  type MCPStatus,
  type MCPToolDef,
} from './mcp-client.js'
export {
  MarkdownSkillLoader,
  getMarkdownSkillLoader,
  type MarkdownSkillDef,
} from './markdown-loader.js'
export {
  AgentLoader,
  getAgentLoader,
  AgentConfigSchema,
  type AgentDef,
  isReadonlyAgent,
  getAllowedTools,
  getDeniedTools,
} from './agent-loader.js'
export {
  AgentManager,
  getAgentManager,
  initializeAgentManager,
  type AgentExecutionResult,
  type ParallelExecutionOptions,
} from './agent-manager.js'
export {
  registerKnowledgeTools,
  unregisterKnowledgeTools,
} from './knowledge-tools.js'

// Hook system
export {
  HookConfigSchema,
  type HookConfig,
  type Hook,
  type HookEvent,
  type HookAction,
  type HookContext,
  type HookHandler,
  type HookResult,
  type HookExecuteOptions,
} from './hook-types.js'
export { HookLoader, getHookLoader } from './hook-loader.js'
export {
  HookManager,
  getHookManager,
  initializeHookManager,
  type HookExecutionResult,
} from './hook-manager.js'

// Spec system
export {
  SpecRequirementSchema,
  SpecTaskSchema,
  SpecDesignSchema,
  SpecDefinitionSchema,
  type SpecRequirement,
  type SpecTask,
  type SpecDesign,
  type SpecDefinition,
  type SpecTaskStatus,
  type SpecTaskPriority,
  type SpecFile,
} from './spec-types.js'
export { SpecLoader, getSpecLoader } from './spec-loader.js'
export {
  SpecManager,
  getSpecManager,
  initializeSpecManager,
  type CreateSpecOptions,
} from './spec-manager.js'
