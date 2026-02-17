/**
 * Unattended Mode - Entry Point
 * 
 * Provides background task execution, scheduling, and unattended operation
 * for WQBot without user interaction.
 */

export {
  TaskScheduler,
  getScheduler,
  createScheduler,
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
  BackgroundExecutor,
  getBackgroundExecutor,
  createBackgroundExecutor,
  type BackgroundJob,
  type JobPriority,
  type JobStatus,
  type WorkerPoolConfig,
  type JobHandler,
  type BackgroundJobEvent
} from './background-executor.js'

export {
  type UnattendedConfig,
  type TaskDefinition,
  type NotificationConfig,
  type SMTPConfig,
  type TaskHandlers,
  type UnattendedCLIOptions,
  BUILT_IN_TASKS
} from './types.js'

export { createUnattendedMode, initUnattendedMode } from './module.js'
