/**
 * Unattended Mode - Module
 * 
 * Module initialization and factory functions.
 */

import { createScheduler, type ScheduledTask } from './task-scheduler.js'
import { createBackgroundExecutor, type JobHandler } from './background-executor.js'
import { createModuleLogger } from '../logger'
import type { UnattendedConfig } from './types.js'

const logger = createModuleLogger('unattended')

/**
 * Create and configure unattended mode
 */
export function createUnattendedMode(config?: UnattendedConfig): {
  scheduler: ReturnType<typeof createScheduler>
  executor: ReturnType<typeof createBackgroundExecutor>
} {
  const scheduler = createScheduler()
  const executor = createBackgroundExecutor({
    maxWorkers: config?.background?.maxWorkers ?? 5,
    jobTimeout: config?.background?.jobTimeout ?? 300000
  })

  return { scheduler, executor }
}

/**
 * Initialize unattended mode with built-in tasks
 */
export async function initUnattendedMode(config: UnattendedConfig): Promise<void> {
  if (!config.enabled) {
    logger.info('Unattended mode is disabled')
    return
  }

  const { scheduler, executor } = createUnattendedMode(config)

  // Register built-in tasks if scheduler is enabled
  if (config.scheduler?.enabled) {
    const tasks = config.scheduler.tasks || []
    
    for (const task of tasks) {
      if (task.enabled === false) continue

      // Create handler from module reference (simplified)
      const handler: JobHandler = async (payload) => {
        logger.info(`Executing scheduled task: ${task.name}`)
        return { success: true, output: payload }
      }

      scheduler.register({
        name: task.name,
        description: task.description,
        cron: task.schedule?.cron,
        interval: task.schedule?.interval,
        enabled: task.enabled ?? true,
        handler,
        config: task.config || {}
      })
    }

    scheduler.start()
    logger.info(`Scheduler started with ${tasks.length} tasks`)
  }

  // Register built-in job handlers if background is enabled
  if (config.background?.enabled) {
    // Register default job handlers
    executor.registerHandler('git-sync', async () => {
      logger.info('Running git sync...')
      return { success: true }
    })

    executor.registerHandler('code-analysis', async () => {
      logger.info('Running code analysis...')
      return { success: true }
    })

    executor.registerHandler('knowledge-index', async () => {
      logger.info('Re-indexing knowledge base...')
      return { success: true }
    })

    executor.registerHandler('backup', async () => {
      logger.info('Running backup...')
      return { success: true }
    })

    logger.info('Background executor initialized')
  }

  logger.info('Unattended mode initialized')
}
