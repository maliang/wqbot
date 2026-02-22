/**
 * Unattended Mode - Background Executor
 * 
 * Handles background task execution with queue management
 * and worker pool for parallel processing.
 */

import { createModuleLogger } from '../logger'
import { EventEmitter } from 'events'
import type { TaskResult, TaskContext } from './task-scheduler.js'

const logger = createModuleLogger('unattended:executor')

export interface BackgroundJob {
  id: string
  name: string
  payload?: Record<string, unknown>
  priority: JobPriority
  status: JobStatus
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  result?: TaskResult
  error?: string
  retryCount: number
}

export type JobPriority = 'low' | 'normal' | 'high' | 'critical'
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface WorkerPoolConfig {
  minWorkers: number
  maxWorkers: number
  idleTimeout: number      // ms before worker is terminated
  jobTimeout: number       // ms before job is cancelled
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<TaskResult>

export interface BackgroundJobEvent {
  type: string
  jobId: string
  data?: unknown
  timestamp: Date
}

export class BackgroundExecutor {
  private queue: BackgroundJob[] = []
  private workers: Map<string, Worker> = new Map()
  private handlers: Map<string, JobHandler> = new Map()
  private emitter: EventEmitter
  private config: WorkerPoolConfig
  private processing = false

  constructor(config?: Partial<WorkerPoolConfig>) {
    this.config = {
      minWorkers: config?.minWorkers ?? 2,
      maxWorkers: config?.maxWorkers ?? 5,
      idleTimeout: config?.idleTimeout ?? 60000,
      jobTimeout: config?.jobTimeout ?? 300000
    }
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(50)
  }

  /**
   * Register a job handler
   */
  registerHandler(jobName: string, handler: JobHandler): void {
    this.handlers.set(jobName, handler)
    logger.info(`Registered job handler: ${jobName}`)
  }

  /**
   * Enqueue a background job
   */
  enqueue(
    jobName: string, 
    payload?: Record<string, unknown>,
    priority: JobPriority = 'normal'
  ): string {
    if (!this.handlers.has(jobName)) {
      throw new Error(`No handler registered for job: ${jobName}`)
    }

    const job: BackgroundJob = {
      id: `${jobName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: jobName,
      payload,
      priority,
      status: 'queued',
      createdAt: new Date(),
      retryCount: 0
    }

    this.queue.push(job)
    
    // Sort by priority
    this.queue.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

    this.emit({ type: 'job:queued', jobId: job.id, data: { jobName, priority } })
    logger.info(`Enqueued job: ${job.id} (${jobName})`)

    // Start processing if not already
    this.processQueue()

    return job.id
  }

  /**
   * Get job status
   */
  getJob(jobId: string): BackgroundJob | undefined {
    return this.queue.find(j => j.id === jobId)
  }

  /**
   * Get all jobs
   */
  getAllJobs(): BackgroundJob[] {
    return [...this.queue]
  }

  /**
   * Cancel a queued job
   */
  cancelJob(jobId: string): boolean {
    const job = this.queue.find(j => j.id === jobId)
    if (!job || job.status !== 'queued') return false

    job.status = 'cancelled'
    this.emit({ type: 'job:cancelled', jobId: job.id })
    logger.info(`Cancelled job: ${jobId}`)
    return true
  }

  /**
   * Retry a failed job
   */
  retryJob(jobId: string): boolean {
    const job = this.queue.find(j => j.id === jobId)
    if (!job || job.status !== 'failed') return false

    job.status = 'queued'
    job.retryCount++
    job.error = undefined
    job.result = undefined
    
    this.emit({ type: 'job:retry', jobId: job.id })
    this.processQueue()
    
    logger.info(`Retrying job: ${jobId} (attempt ${job.retryCount})`)
    return true
  }

  /**
   * Process the job queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return
    if (this.queue.filter(j => j.status === 'queued').length === 0) return

    this.processing = true

    try {
      while (true) {
        const availableWorkers = Array.from(this.workers.values())
          .filter(w => w.status === 'idle')
        
        const queuedJobs = this.queue
          .filter(j => j.status === 'queued')
          .slice(0, availableWorkers.length)

        if (queuedJobs.length === 0) break

        for (const job of queuedJobs) {
          const worker = availableWorkers.shift()
          if (worker) {
            this.executeJob(job, worker)
          }
        }
      }
    } finally {
      this.processing = false
    }
  }

  /**
   * Execute a job on a worker
   */
  private async executeJob(job: BackgroundJob, worker: Worker): Promise<void> {
    job.status = 'processing'
    job.startedAt = new Date()
    worker.status = 'busy'
    worker.currentJob = job.id

    this.emit({ type: 'job:started', jobId: job.id })
    logger.info(`Executing job: ${job.id} on worker: ${worker.id}`)

    const handler = this.handlers.get(job.name)
    if (!handler) {
      job.status = 'failed'
      job.error = 'No handler found'
      worker.status = 'idle'
      worker.currentJob = undefined
      return
    }

    try {
      const result = await this.withTimeout(
        handler(job.payload || {}),
        this.config.jobTimeout
      )

      job.status = 'completed'
      job.completedAt = new Date()
      job.result = {
        success: true,
        output: result.output,
        duration: job.completedAt.getTime() - job.startedAt!.getTime()
      }

      this.emit({ type: 'job:completed', jobId: job.id, data: result })
      logger.info(`Job completed: ${job.id}`)

    } catch (error) {
      const err = error as Error
      
      job.status = 'failed'
      job.completedAt = new Date()
      job.error = err.message
      job.result = {
        success: false,
        error: err.message
      }

      this.emit({ type: 'job:failed', jobId: job.id, data: { error: err.message } })
      logger.error(`Job failed: ${job.id} - ${err.message}`)
    }

    worker.status = 'idle'
    worker.currentJob = undefined

    // Continue processing
    this.processQueue()
  }

  /**
   * Wrap promise with timeout
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job timed out after ${ms}ms`))
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

  /**
   * Subscribe to job events
   */
  on(event: string, handler: (event: BackgroundJobEvent) => void): void {
    this.emitter.on(event, handler)
  }

  /**
   * Unsubscribe from job events
   */
  off(event: string, handler: (event: BackgroundJobEvent) => void): void {
    this.emitter.off(event, handler)
  }

  /**
   * Emit an event
   */
  private emit(event: BackgroundJobEvent): void {
    event.timestamp = new Date()
    this.emitter.emit(event.type, event)
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queued: number
    processing: number
    completed: number
    failed: number
    workers: { idle: number; busy: number }
  } {
    return {
      queued: this.queue.filter(j => j.status === 'queued').length,
      processing: this.queue.filter(j => j.status === 'processing').length,
      completed: this.queue.filter(j => j.status === 'completed').length,
      failed: this.queue.filter(j => j.status === 'failed').length,
      workers: {
        idle: Array.from(this.workers.values()).filter(w => w.status === 'idle').length,
        busy: Array.from(this.workers.values()).filter(w => w.status === 'busy').length
      }
    }
  }
}

interface Worker {
  id: string
  status: 'idle' | 'busy'
  currentJob?: string
}

// Singleton instance
let executorInstance: BackgroundExecutor | null = null

export function getBackgroundExecutor(): BackgroundExecutor {
  if (!executorInstance) {
    executorInstance = new BackgroundExecutor()
  }
  return executorInstance
}

export function createBackgroundExecutor(config?: Partial<WorkerPoolConfig>): BackgroundExecutor {
  return new BackgroundExecutor(config)
}
