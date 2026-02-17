import type { EventType } from '@wqbot/core'
import { z } from 'zod'

/**
 * Hook event types (mapped to EventType)
 */
export type HookEvent =
  | 'tool:before' // PreToolUse - before tool execution
  | 'tool:after' // PostToolUse - after tool execution
  | 'session:start' // SessionStart - at session start
  | 'session:stop' // Stop - when session stops
  | 'prompt:submit' // UserPromptSubmit - when user submits

/**
 * Hook action types
 */
export type HookAction = 'block' | 'warn' | 'allow' | 'modify'

/**
 * Hook definition from markdown file
 */
export const HookConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  event: z.enum(['tool:before', 'tool:after', 'session:start', 'session:stop', 'prompt:submit']),
  enabled: z.boolean().default(true),
  priority: z.number().default(50),
  action: z.enum(['block', 'warn', 'allow', 'modify']).default('allow'),
  conditions: z.record(z.unknown()).optional(),
  tools: z.array(z.string()).optional(), // Only for tool:before/after
  patterns: z.array(z.string()).optional(), // Regex patterns to match
  timeout: z.number().optional(), // Timeout in ms
})

export type HookConfig = z.infer<typeof HookConfigSchema>

/**
 * Runtime hook with compiled patterns
 */
export interface Hook extends HookConfig {
  readonly id: string
  readonly source: 'global' | 'project' | 'builtin'
  readonly compiledPatterns?: RegExp[]
  readonly handler?: HookHandler
}

/**
 * Hook execution context
 */
export interface HookContext {
  readonly event: HookEvent
  readonly tool?: string
  readonly args?: Record<string, unknown>
  readonly result?: unknown
  readonly input?: string
  readonly timestamp: Date
  readonly sessionId?: string
  readonly conversationId?: string
}

/**
 * Hook handler function
 */
export type HookHandler = (context: HookContext) => Promise<HookResult>

/**
 * Hook execution result
 */
export interface HookResult {
  /** Action to take */
  action: HookAction
  /** Modified args (for modify action) */
  modifiedArgs?: Record<string, unknown>
  /** Warning/error message */
  message?: string
  /** Additional data */
  data?: Record<string, unknown>
}

/**
 * Hook execution options
 */
export interface HookExecuteOptions {
  /** Continue to next hook if one blocks */
  continueOnBlock?: boolean
  /** Timeout for hook execution */
  timeout?: number
}
