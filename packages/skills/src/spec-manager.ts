import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createModuleLogger } from '@wqbot/core'
import { getSpecLoader } from './spec-loader.js'
import type {
  SpecDefinition,
  SpecRequirement,
  SpecTask,
  SpecTaskStatus,
} from './spec-types.js'

const logger = createModuleLogger('spec-manager')

/**
 * Spec creation options
 */
export interface CreateSpecOptions {
  readonly name: string
  readonly description: string
  readonly author?: string
  readonly tags?: readonly string[]
}

/**
 * Spec manager - CRUD operations for specs
 */
export class SpecManager {
  private readonly specs: Map<string, SpecDefinition> = new Map()
  private readonly specsDir: string
  private initialized = false

  constructor(projectDir: string = process.cwd()) {
    this.specsDir = path.join(projectDir, '.wqbot', 'specs')
  }

  /**
   * Initialize and load all specs
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const loader = getSpecLoader()
    const loadedSpecs = await loader.loadAll()

    this.specs.clear()
    for (const spec of loadedSpecs) {
      this.specs.set(spec.id, spec)
    }

    this.initialized = true
    logger.info(`Spec manager initialized: ${this.specs.size} specs`)
  }

  /**
   * Get all specs
   */
  getAll(): readonly SpecDefinition[] {
    return [...this.specs.values()]
  }

  /**
   * Get a spec by ID
   */
  get(id: string): SpecDefinition | undefined {
    return this.specs.get(id)
  }

  /**
   * Create a new spec
   */
  async create(options: CreateSpecOptions): Promise<SpecDefinition> {
    const id = this.generateId(options.name)
    const specDir = path.join(this.specsDir, id)

    // Create directory structure
    await fs.mkdir(path.join(specDir, 'requirements'), { recursive: true })
    await fs.mkdir(path.join(specDir, 'design'), { recursive: true })
    await fs.mkdir(path.join(specDir, 'tasks'), { recursive: true })

    // Create spec.md
    const specContent = `---
name: ${options.name}
description: ${options.description}
version: 1.0.0
status: draft
author: ${options.author ?? ''}
tags: [${(options.tags ?? []).join(', ')}]
---

# ${options.name}

${options.description}

## Overview

<!-- Add your spec overview here -->

## Requirements

<!-- Requirements will be listed here -->

## Design

<!-- Design documents will be linked here -->

## Tasks

<!-- Implementation tasks will be tracked here -->
`

    await fs.writeFile(path.join(specDir, 'spec.md'), specContent)

    const spec: SpecDefinition = {
      id,
      name: options.name,
      description: options.description,
      version: '1.0.0',
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      author: options.author,
      tags: [...(options.tags ?? [])],
      requirements: [],
      tasks: [],
      progress: {
        totalRequirements: 0,
        completedRequirements: 0,
        totalTasks: 0,
        completedTasks: 0,
        percentage: 0,
      },
    }

    this.specs.set(id, spec)
    logger.info(`Created spec: ${id}`)

    return spec
  }

  /**
   * Add a requirement to a spec
   */
  async addRequirement(
    specId: string,
    requirement: Omit<SpecRequirement, 'id'>
  ): Promise<SpecRequirement | null> {
    const spec = this.specs.get(specId)
    if (!spec) return null

    const id = this.generateId(requirement.title)
    const reqPath = path.join(this.specsDir, specId, 'requirements', `${id}.md`)

    const content = `---
title: ${requirement.title}
priority: ${requirement.priority}
status: ${requirement.status}
dependencies: [${(requirement.dependencies ?? []).join(', ')}]
acceptanceCriteria:
${(requirement.acceptanceCriteria ?? []).map(c => `  - ${c}`).join('\n')}
---

# ${requirement.title}

${requirement.description}

## Acceptance Criteria

${(requirement.acceptanceCriteria ?? []).map(c => `- [ ] ${c}`).join('\n')}
`

    await fs.writeFile(reqPath, content)

    const newReq: SpecRequirement = {
      id,
      ...requirement,
    }

    // Update spec
    const updatedSpec: SpecDefinition = {
      ...spec,
      requirements: [...spec.requirements, newReq],
      updatedAt: new Date(),
    }
    updatedSpec.progress = this.calculateProgress(updatedSpec)
    this.specs.set(specId, updatedSpec)

    logger.debug(`Added requirement ${id} to spec ${specId}`)
    return newReq
  }

  /**
   * Add a task to a spec
   */
  async addTask(
    specId: string,
    task: Omit<SpecTask, 'id'>
  ): Promise<SpecTask | null> {
    const spec = this.specs.get(specId)
    if (!spec) return null

    const id = this.generateId(task.title)
    const taskPath = path.join(this.specsDir, specId, 'tasks', `${id}.md`)

    const content = `---
title: ${task.title}
requirementId: ${task.requirementId}
status: ${task.status}
priority: ${task.priority}
assignee: ${task.assignee ?? ''}
estimatedHours: ${task.estimatedHours ?? ''}
dependencies: [${(task.dependencies ?? []).join(', ')}]
---

# ${task.title}

${task.description ?? ''}

## Notes

${(task.notes ?? []).map(n => `- ${n}`).join('\n')}
`

    await fs.writeFile(taskPath, content)

    const newTask: SpecTask = {
      id,
      ...task,
    }

    // Update spec
    const updatedSpec: SpecDefinition = {
      ...spec,
      tasks: [...spec.tasks, newTask],
      updatedAt: new Date(),
    }
    updatedSpec.progress = this.calculateProgress(updatedSpec)
    this.specs.set(specId, updatedSpec)

    logger.debug(`Added task ${id} to spec ${specId}`)
    return newTask
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    specId: string,
    taskId: string,
    status: SpecTaskStatus
  ): Promise<boolean> {
    const spec = this.specs.get(specId)
    if (!spec) return false

    const task = spec.tasks.find(t => t.id === taskId)
    if (!task) return false

    // Update task file
    const taskPath = path.join(this.specsDir, specId, 'tasks', `${taskId}.md`)
    try {
      const content = await fs.readFile(taskPath, 'utf-8')
      const updatedContent = content.replace(
        /^status:\s*\w+/m,
        `status: ${status}`
      )
      await fs.writeFile(taskPath, updatedContent)
    } catch {
      return false
    }

    // Update in-memory spec
    const updatedTasks = spec.tasks.map(t =>
      t.id === taskId ? { ...t, status } : t
    )
    const updatedSpec: SpecDefinition = {
      ...spec,
      tasks: updatedTasks,
      updatedAt: new Date(),
    }
    updatedSpec.progress = this.calculateProgress(updatedSpec)
    this.specs.set(specId, updatedSpec)

    logger.debug(`Updated task ${taskId} status to ${status}`)
    return true
  }

  /**
   * Delete a spec
   */
  async delete(specId: string): Promise<boolean> {
    const spec = this.specs.get(specId)
    if (!spec) return false

    const specDir = path.join(this.specsDir, specId)
    try {
      await fs.rm(specDir, { recursive: true })
      this.specs.delete(specId)
      logger.info(`Deleted spec: ${specId}`)
      return true
    } catch {
      return false
    }
  }

  /**
   * Reload all specs
   */
  async reload(): Promise<void> {
    this.specs.clear()
    this.initialized = false
    await this.initialize()
    logger.info('Specs reloaded')
  }

  /**
   * Get next tasks to work on
   */
  getNextTasks(specId: string, limit = 5): SpecTask[] {
    const spec = this.specs.get(specId)
    if (!spec) return []

    // Get pending tasks with satisfied dependencies
    const completedTaskIds = new Set(
      spec.tasks.filter(t => t.status === 'completed').map(t => t.id)
    )

    return spec.tasks
      .filter(t => {
        if (t.status !== 'pending') return false
        if (!t.dependencies || t.dependencies.length === 0) return true
        return t.dependencies.every(dep => completedTaskIds.has(dep))
      })
      .sort((a, b) => {
        // Sort by priority
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      })
      .slice(0, limit)
  }

  /**
   * Generate a URL-safe ID from a name
   */
  private generateId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) + '-' + Date.now().toString(36)
  }

  /**
   * Calculate progress for a spec
   */
  private calculateProgress(spec: SpecDefinition): SpecDefinition['progress'] {
    const totalRequirements = spec.requirements.length
    const completedRequirements = spec.requirements.filter(r => r.status === 'completed').length
    const totalTasks = spec.tasks.length
    const completedTasks = spec.tasks.filter(t => t.status === 'completed').length

    const total = totalRequirements + totalTasks
    const completed = completedRequirements + completedTasks
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return {
      totalRequirements,
      completedRequirements,
      totalTasks,
      completedTasks,
      percentage,
    }
  }
}

// Singleton
let managerInstance: SpecManager | null = null

export function getSpecManager(): SpecManager {
  if (!managerInstance) {
    managerInstance = new SpecManager()
  }
  return managerInstance
}

export async function initializeSpecManager(): Promise<SpecManager> {
  const manager = getSpecManager()
  await manager.initialize()
  return manager
}
