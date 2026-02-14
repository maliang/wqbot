import { z } from 'zod'

// Task complexity levels for model routing
export type TaskComplexity = 'low' | 'medium' | 'high'

// Task types for model selection
export type TaskType =
  | 'simple_qa'
  | 'code_generation'
  | 'complex_reasoning'
  | 'file_operation'
  | 'shell_command'
  | 'web_operation'
  | 'local_only'

// Message roles in conversation
export type MessageRole = 'user' | 'assistant' | 'system'

// Message structure
export interface Message {
  readonly id: string
  readonly role: MessageRole
  readonly content: string
  readonly timestamp: Date
  readonly metadata?: Record<string, unknown> | undefined
  readonly compactedAt?: Date | undefined
  readonly isSummary?: boolean | undefined
  readonly tokenCount?: number | undefined
  readonly isPinned?: boolean | undefined
}

// Conversation structure
export interface Conversation {
  readonly id: string
  readonly title: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly messages: readonly Message[]
}

// Intent analysis result
export interface Intent {
  readonly type: TaskType
  readonly complexity: TaskComplexity
  readonly confidence: number
  readonly entities: readonly string[]
  readonly suggestedSkills: readonly string[]
}

// Execution result
export interface ExecutionResult<T = unknown> {
  readonly success: boolean
  readonly data?: T | undefined
  readonly error?: string | undefined
  readonly duration: number
  readonly skillUsed?: string | undefined
}

// Model routing strategy
export type RoutingStrategy = 'quality' | 'balanced' | 'economy'

// 模型上下文信息（models 和 storage 共用）
export interface ModelContextInfo {
  readonly contextWindow: number
  readonly maxOutputTokens: number
}

// Model provider types
export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'ollama'
  | 'groq'
  | 'custom'

// Model configuration
export interface ModelConfig {
  readonly id: string
  readonly provider: ModelProvider
  readonly priority: number
  readonly costPer1k?: number | undefined
  readonly maxTokens?: number | undefined
  readonly capabilities?: readonly string[] | undefined
}

// Provider configuration
// 注意：这些类型已废弃，请使用 config.yaml 中的 providers 配置
export interface ProviderConfig {
  readonly enabled: boolean
  /** @deprecated 请使用 config.yaml */
  readonly apiKey?: string | undefined
  /** @deprecated 请使用 config.yaml */
  readonly baseUrl?: string | undefined
  readonly models: readonly ModelConfig[]
}

// Routing configuration
export interface RoutingConfig {
  readonly strategy: RoutingStrategy
  readonly fallbackChain: readonly ModelProvider[]
  readonly taskMapping: Record<TaskType, readonly string[]>
}

// Full models configuration
export interface ModelsConfig {
  readonly providers: Record<ModelProvider, ProviderConfig>
  readonly routing: RoutingConfig
}

// Permission types for skills
export const PermissionSchema = z.enum([
  'file:read',
  'file:write',
  'file:delete',
  'shell:execute',
  'network:http',
  'network:websocket',
  'system:clipboard',
  'system:notification',
  'system:process',
])

export type Permission = z.infer<typeof PermissionSchema>

// Skill trigger configuration
export interface SkillTrigger {
  readonly patterns: readonly string[]
  readonly examples: readonly string[]
  readonly priority: number
}

// Skill manifest
export interface SkillManifest {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly keywords: readonly string[]
  readonly capabilities: readonly string[]
  readonly triggers: SkillTrigger
  readonly permissions: readonly Permission[]
  readonly platforms: readonly string[]
  readonly repository?: string | undefined
}

// Skill execution context
export interface SkillContext {
  readonly conversationId: string
  readonly userId?: string | undefined
  readonly workingDirectory: string
  readonly environment: Record<string, string>
}

// Skill execution input
export interface SkillInput {
  readonly command: string
  readonly args: readonly string[]
  readonly context: SkillContext
}

// Skill execution output
export interface SkillOutput<T = unknown> {
  readonly success: boolean
  readonly data?: T | undefined
  readonly error?: string | undefined
  readonly logs?: readonly string[] | undefined
}

// Event types for the system
export type EventType =
  | 'conversation:start'
  | 'conversation:end'
  | 'message:received'
  | 'message:sent'
  | 'skill:execute'
  | 'skill:complete'
  | 'model:request'
  | 'model:response'
  | 'config:change'
  | 'error'

// System event
export interface SystemEvent {
  readonly type: EventType
  readonly timestamp: Date
  readonly data: Record<string, unknown>
}

// Event handler type
export type EventHandler = (event: SystemEvent) => void | Promise<void>
