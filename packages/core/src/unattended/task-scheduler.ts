/**
 * Unattended Mode - Task Scheduler
 * 
 * Provides background task scheduling and execution capabilities
 * for unattended/headless operation.
 */

import { createModuleLogger } from '@wqbot/logger'
import type { EventEmitter } from 'events'

const logger = createModuleLogger('unattended:scheduler')

export interface ScheduledTask {
  id: string
  name: string
  description?: string
  cron?: string           // Cron expression
  interval?: number       // Interval in milliseconds
  enabled: boolean
  handler: TaskHandler
  lastRun?: Date
  nextRun?: Date
  runCount: number
  config: TaskConfig
}

export interface TaskConfig {
  timeout?: number        // Max execution time in ms
  retryCount?: number     // Number of retries on failure
  retryDelay?: number     // Delay between retries (ms)
  runOnStartup?: boolean  // Run immediately when scheduler starts
  maxConcurrent?: number  // Max concurrent executions
}

export type TaskHandler = (context: TaskContext) => Promise<TaskResult>
export type TaskContext = {
  taskId: string
  taskName: string
  args?: Record<string, unknown>
  emitter?: EventEmitter
}

export interface TaskResult {
  success: boolean
  output?: unknown
  error?: string
  duration?: number
}

export interface TaskExecution {
  taskId: string
  startTime: Date
  endTime?: Date
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: TaskResult
  error?: Error
}

export type TaskEventType = 
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:retry'
  | 'task:cancelled'
  | 'scheduler:started'
  | 'scheduler:stopped'
  | 'scheduler:error'

export interface TaskEvent {
  type: TaskEventType
  taskId?: string
  taskName?: string
  data?: unknown
  timestamp: Date
}

export class TaskScheduler {
  private tasks: Map<string, ScheduledTask> = new Map()
  private executions: Map<string, TaskExecution> = new Map()
  private timers: Map<string, NodeJS.Timeout> = new Map()
  private emitter: EventEmitter
  private running = false

  constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(100)
  }

  /**
   * Register a new task
   */
  register(task: Omit<ScheduledTask, 'id' | 'runCount'>): string {
    const id = task.name.toLowerCase().replace(/\s+/g, '-')
    
    if (this.tasks.has(id)) {
      throw new Error(`Task '${id}' already registered`)
    }

    const scheduledTask: ScheduledTask = {
      ...task,
      id,
      runCount: 0,
      enabled: task.enabled ?? true
    }

    this.tasks.set(id, scheduledTask)
    logger.info(`Registered task: ${id}`)

    if (this.running && scheduledTask.enabled) {
      this.scheduleTask(scheduledTask)
    }

    return id
  }

  /**
   * Unregister a task
   */
  unregister(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false

    this.cancelTask(taskId)
    this.tasks.delete(taskId)
    logger.info(`Unregistered task: ${taskId}`)
    return true
  }

  /**
   * Enable/disable a task
   */
  setTaskEnabled(taskId: string, enabled: boolean): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false

    task.enabled = enabled
    
    if (enabled && this.running) {
      this.scheduleTask(task)
    } else if (!enabled) {
      this.cancelTask(taskId)
    }

    logger.info(`Task ${taskId} ${enabled ? 'enabled' : 'disabled'}`)
    return true
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * Get all tasks
   */
  getAllTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Get task execution history
   */
  getExecutionHistory(taskId: string, limit = 10): TaskExecution[] {
    const executions = Array.from(this.executions.values())
      .filter(e => e.taskId === taskId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    return executions.slice(0, limit)
  }

  /**
   * Manually trigger a task
   */
  async runTask(taskId: string, args?: Record<string, unknown>): Promise<TaskExecution> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`Task '${taskId}' not found`)
    }

    return this.executeTask(task, args)
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) return

    this.running = true
    logger.info('Task scheduler started')

    // Schedule all enabled tasks
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        if (task.config.runOnStartup) {
          // Run immediately on startup
          this.executeTask(task).catch(err => {
            logger.error(`Startup task failed: ${err.message}`)
          })
        }
        this.scheduleTask(task)
      }
    }

    this.emit({ type: 'scheduler:started', timestamp: new Date() })
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) return

    this.running = false

    // Cancel all scheduled timers
    for (const [taskId, timer] of this.timers) {
      clearTimeout(timer)
      this.timers.delete(taskId)
    }

    logger.info('Task scheduler stopped')
    this.emit({ type: 'scheduler:stopped', timestamp: new Date() })
  }

  /**
   * Subscribe to task events
   */
  on(event: TaskEventType, handler: (event: TaskEvent) => void): void {
    this.emitter.on(event, handler)
  }

  /**
   * Unsubscribe from task events
   */
  off(event: TaskEventType, handler: (event: TaskEvent) => void): void {
    this.emitter.off(event, handler)
  }

  /**
   * Emit a task event
   */
  private emit(event: TaskEvent): void {
    this.emitter.emit(event.type, event)
  }

  /**
   * Schedule a task for execution
   */
  private scheduleTask(task: ScheduledTask): void {
    // Cancel existing schedule
    this.cancelTask(task.id)

    if (task.cron) {
      this.scheduleCron(task)
    } else if (task.interval) {
      this.scheduleInterval(task)
    }

    // Calculate next run time
    if (task.interval) {
      task.nextRun = new Date(Date.now() + task.interval)
    }
  }

  /**
   * Schedule task with cron expression (simplified)
   */
  private scheduleCron(task: ScheduledTask): void {
    // Simplified cron: only supports basic patterns
    // For production, use a proper cron library like cron-parser
    const parts = (task.cron || '').split(' ')
    if (parts.length < 5) return

    const [minute, hour, day, month, weekday] = parts
    
    const scheduleNext = () => {
      const now = new Date()
      // Simple implementation - check every minute
      const checkInterval = 60000
      
      const timer = setInterval(() => {
        const now = new Date()
        if (this.matchesCron(now, task.cron!)) {
          clearInterval(timer)
          this.executeTask(task).finally(() => {
            if (this.running && task.enabled) {
              scheduleNext()
            }
          })
        }
      }, checkInterval)

      this.timers.set(task.id, timer)
    }

    scheduleNext()
  }

  /**
   * Simple cron matching (simplified version)
   */
  private matchesCron(date: Date, cron: string): boolean {
    const parts = cron.split(' ')
    const [minute, hour, day, month, weekday] = parts
    
    const match = (pattern: string, value: number): boolean => {
      if (pattern === '*') return true
      if (pattern.includes(',')) {
        return pattern.split(',').map(Number).includes(value)
      }
      if (pattern.includes('-')) {
        const [start, end] = pattern.split('-').map(Number)
        return value >= start && value <= end
      }
      if (pattern.includes('/')) {
        const [, step] = pattern.split('/')
        return value % Number(step) === 0
      }
      return Number(pattern) === value
    }

    return (
      match(minute, date.getMinutes()) &&
      match(hour, date.getHours()) &&
      match(day, date.getDate()) &&
      match(month, date.getMonth() + 1) &&
      match(weekday, date.getDay())
    )
  }

  /**
   * Schedule task with interval
   */
  private scheduleInterval(task: ScheduledTask): void {
    const run = () => {
      this.executeTask(task).finally(() => {
        if (this.running && task.enabled && task.interval) {
          const timer = setTimeout(run, task.interval)
          this.timers.set(task.id, timer)
          task.nextRun = new Date(Date.now() + task.interval)
        }
      })
    }

    // Initial delay
    const timer = setTimeout(run, task.interval)
    this.timers.set(task.id, timer)
    task.nextRun = new Date(Date.now() + task.interval!)
  }

  /**
   * Cancel a scheduled task
   */
  private cancelTask(taskId: string): void {
    const timer = this.timers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(taskId)
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(
    task: ScheduledTask, 
    args?: Record<string, unknown>
  ): Promise<TaskExecution> {
    const execution: TaskExecution = {
      taskId: task.id,
      startTime: new Date(),
      status: 'running'
    }

    this.executions.set(`${task.id}-${execution.startTime.getTime()}`, execution)
    task.lastRun = execution.startTime

    this.emit({
      type: 'task:started',
      taskId: task.id,
      taskName: task.name,
      timestamp: execution.startTime
    })

    logger.info(`Executing task: ${task.id}`)

    const context: TaskContext = {
      taskId: task.id,
      taskName: task.name,
      args,
      emitter: this.emitter
    }

    const timeout = task.config.timeout || 300000 // 5 minutes default

    try {
      const result = await this.withTimeout(task.handler(context), timeout)
      
      execution.status = 'completed'
      execution.result = {
        success: true,
        output: result,
        duration: Date.now() - execution.startTime.getTime()
      }
      
      task.runCount++
      
      this.emit({
        type: 'task:completed',
        taskId: task.id,
        taskName: task.name,
        data: execution.result,
        timestamp: new Date()
      })

      logger.info(`Task completed: ${task.id}`)

    } catch (error) {
      const err = error as Error
      
      // Check for retry
      if (task.config.retryCount && task.config.retryCount > 0) {
        await this.retryTask(task, context, task.config.retryCount)
      }

      execution.status = 'failed'
      execution.error = err
      execution.result = {
        success: false,
        error: err.message,
        duration: Date.now() - execution.startTime.getTime()
      }

      task.runCount++

      this.emit({
        type: 'task:failed',
        taskId: task.id,
        taskName: task.name,
        data: { error: err.message },
        timestamp: new Date()
      })

      logger.error(`Task failed: ${task.id} - ${err.message}`)
    }

    execution.endTime = new Date()
    return execution
  }

  /**
   * Retry a failed task
   */
  private async retryTask(
    task: ScheduledTask, 
    context: TaskContext, 
    remainingRetries: number
  ): Promise<void> {
    const delay = task.config.retryDelay || 1000

    this.emit({
      type: 'task:retry',
      taskId: task.id,
      taskName: task.name,
      data: { remainingRetries, nextRetryIn: delay },
      timestamp: new Date()
    })

    await new Promise(resolve => setTimeout(resolve, delay))

    try {
      await task.handler(context)
    } catch (error) {
      if (remainingRetries > 1) {
        await this.retryTask(task, context, remainingRetries - 1)
      }
    }
  }

  /**
   * Wrap promise with timeout
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task timed out after ${ms}ms`))
      }, ms)

      promise
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(err => {
          clearTimeout(timer)
          reject(err)
        })
    })
  }
}

// Singleton instance
let schedulerInstance: TaskScheduler | null = null

export function getScheduler(): TaskScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new TaskScheduler()
  }
  return schedulerInstance
}

export function createScheduler(): TaskScheduler {
  return new TaskScheduler()
}
