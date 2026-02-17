/**
 * Unattended Mode - Types
 * 
 * Type definitions for unattended/background operation features.
 */

import type { TaskHandler, TaskConfig, TaskResult } from './task-scheduler.js'
import type { JobHandler, JobPriority } from './background-executor.js'

// Re-export types
export {
  type ScheduledTask,
  type TaskConfig,
  type TaskHandler,
  type TaskContext,
  type TaskResult,
  type TaskExecution,
  type TaskEvent,
  type TaskEventType
} from './task-scheduler.js'

export {
  type BackgroundJob,
  type JobPriority,
  type JobStatus,
  type WorkerPoolConfig,
  type JobHandler,
  type BackgroundJobEvent
} from './background-executor.js'

// Unattended mode configuration
export interface UnattendedConfig {
  enabled: boolean
  mode: 'daemon' | 'cron' | 'queue'
  scheduler?: {
    enabled: boolean
    tasks?: TaskDefinition[]
  }
  background?: {
    enabled: boolean
    maxWorkers?: number
    jobTimeout?: number
  }
  watchPaths?: string[]           // Paths to watch for changes
  watchPatterns?: string[]        // File patterns to trigger tasks
  notifications?: NotificationConfig
}

export interface TaskDefinition {
  name: string
  description?: string
  handler: string                // Handler reference (module.method)
  schedule?: {
    cron?: string
    interval?: number
  }
  config?: TaskConfig
  enabled?: boolean
}

export interface NotificationConfig {
  enabled: boolean
  onSuccess?: boolean
  onFailure?: boolean
  channels?: ('console' | 'webhook' | 'email')[]
  webhookUrl?: string
  email?: {
    to: string | string[]
    smtp?: SMTPConfig
  }
}

export interface SMTPConfig {
  host: string
  port: number
  secure: boolean
  auth: {
    user: string
    pass: string
  }
}

// Predefined task handlers
export interface TaskHandlers {
  'git-sync': TaskHandler
  'code-analysis': TaskHandler
  'knowledge-index': TaskHandler
  'backup': TaskHandler
  'cleanup': TaskHandler
  'report': TaskHandler
}

// Built-in scheduled tasks
export const BUILT_IN_TASKS = {
  'git-sync': {
    name: 'Git Sync',
    description: 'Auto-commit and push changes',
    schedule: { cron: '0 */6 * * *' }, // Every 6 hours
    config: { timeout: 60000 }
  },
  'code-analysis': {
    name: 'Code Analysis',
    description: 'Run static code analysis',
    schedule: { cron: '0 2 * * *' }, // Daily at 2 AM
    config: { timeout: 300000 }
  },
  'knowledge-index': {
    name: 'Knowledge Index',
    description: 'Re-index knowledge base',
    schedule: { interval: 3600000 }, // Every hour
    config: { timeout: 180000 }
  },
  'cleanup': {
    name: 'Cleanup',
    description: 'Clean up temporary files and old logs',
    schedule: { cron: '0 3 * * 0' }, // Weekly on Sunday at 3 AM
    config: { timeout: 60000 }
  }
} as const

// CLI commands for unattended mode
export interface UnattendedCLIOptions {
  daemon: boolean
  queue: string[]
  schedule: string
  list: boolean
  status: string
  cancel: string
  logs: string
  watch: string[]
}
