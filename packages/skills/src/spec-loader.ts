import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createModuleLogger } from '@wqbot/core'
import {
  SpecDefinitionSchema,
  SpecRequirementSchema,
  SpecTaskSchema,
  SpecDesignSchema,
  type SpecDefinition,
  type SpecRequirement,
  type SpecTask,
  type SpecDesign,
  type SpecFile,
} from './spec-types.js'

const logger = createModuleLogger('spec-loader')

/**
 * Load and parse specs from .wqbot/specs directory
 */
export class SpecLoader {
  private readonly specsDir: string

  constructor(projectDir: string = process.cwd()) {
    this.specsDir = path.join(projectDir, '.wqbot', 'specs')
  }

  /**
   * Load all specs from the specs directory
   */
  async loadAll(): Promise<SpecDefinition[]> {
    const specs = new Map<string, SpecDefinition>()

    try {
      await fs.access(this.specsDir)
    } catch {
      logger.debug('Specs directory does not exist', { path: this.specsDir })
      return []
    }

    // Load each spec directory
    const specDirs = await this.getSpecDirectories()
    
    for (const specDir of specDirs) {
      const spec = await this.loadSpec(specDir)
      if (spec) {
        specs.set(spec.id, spec)
      }
    }

    logger.info(`Loaded ${specs.size} specs`)
    return [...specs.values()]
  }

  /**
   * Get all spec directories
   */
  private async getSpecDirectories(): Promise<string[]> {
    const entries = await fs.readdir(this.specsDir, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory())
      .map(e => path.join(this.specsDir, e.name))
  }

  /**
   * Load a single spec from its directory
   */
  private async loadSpec(specDir: string): Promise<SpecDefinition | null> {
    const specId = path.basename(specDir)
    
    // Load spec.md (main spec file)
    const specMdPath = path.join(specDir, 'spec.md')
    let baseSpec: Partial<SpecDefinition> = { id: specId }

    try {
      const content = await fs.readFile(specMdPath, 'utf-8')
      baseSpec = this.parseSpecMarkdown(content, specId)
    } catch {
      // spec.md is optional
    }

    // Load requirements
    const requirements = await this.loadRequirements(specDir)

    // Load design
    const design = await this.loadDesigns(specDir)

    // Load tasks
    const tasks = await this.loadTasks(specDir)

    // Calculate progress
    const progress = this.calculateProgress(requirements, tasks)

    const spec: SpecDefinition = {
      id: specId,
      name: baseSpec.name ?? specId,
      description: baseSpec.description ?? '',
      version: baseSpec.version ?? '1.0.0',
      status: baseSpec.status ?? 'draft',
      createdAt: baseSpec.createdAt ?? new Date(),
      updatedAt: new Date(),
      author: baseSpec.author,
      tags: baseSpec.tags ?? [],
      requirements,
      design,
      tasks,
      progress,
    }

    return spec
  }

  /**
   * Parse main spec.md file
   */
  private parseSpecMarkdown(content: string, specId: string): Partial<SpecDefinition> {
    const { frontmatter, body } = this.parseMarkdown(content)

    return {
      id: specId,
      name: frontmatter.name ?? specId,
      description: frontmatter.description ?? body.slice(0, 500),
      version: frontmatter.version ?? '1.0.0',
      status: frontmatter.status ?? 'draft',
      author: frontmatter.author,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    }
  }

  /**
   * Load requirements from requirements/ directory
   */
  private async loadRequirements(specDir: string): Promise<SpecRequirement[]> {
    const requirements: SpecRequirement[] = []
    const reqDir = path.join(specDir, 'requirements')

    try {
      const entries = await fs.readdir(reqDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue
        
        const filePath = path.join(reqDir, entry.name)
        const content = await fs.readFile(filePath, 'utf-8')
        const req = this.parseRequirement(content, entry.name)
        
        if (req) {
          requirements.push(req)
        }
      }
    } catch {
      // Requirements directory doesn't exist
    }

    return requirements
  }

  /**
   * Load designs from design/ directory
   */
  private async loadDesigns(specDir: string): Promise<SpecDesign[] | undefined> {
    const designs: SpecDesign[] = []
    const designDir = path.join(specDir, 'design')

    try {
      const entries = await fs.readdir(designDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue
        
        const filePath = path.join(designDir, entry.name)
        const content = await fs.readFile(filePath, 'utf-8')
        const design = this.parseDesign(content, entry.name)
        
        if (design) {
          designs.push(design)
        }
      }
    } catch {
      // Design directory doesn't exist
    }

    return designs.length > 0 ? designs : undefined
  }

  /**
   * Load tasks from tasks/ directory
   */
  private async loadTasks(specDir: string): Promise<SpecTask[]> {
    const tasks: SpecTask[] = []
    const tasksDir = path.join(specDir, 'tasks')

    try {
      const entries = await fs.readdir(tasksDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue
        
        const filePath = path.join(tasksDir, entry.name)
        const content = await fs.readFile(filePath, 'utf-8')
        const task = this.parseTask(content, entry.name)
        
        if (task) {
          tasks.push(task)
        }
      }
    } catch {
      // Tasks directory doesn't exist
    }

    return tasks
  }

  /**
   * Parse requirement markdown
   */
  private parseRequirement(content: string, filename: string): SpecRequirement | null {
    const { frontmatter, body } = this.parseMarkdown(content)
    const id = path.basename(filename, '.md')

    const result = SpecRequirementSchema.safeParse({
      id,
      title: frontmatter.title ?? id,
      description: frontmatter.description ?? body.slice(0, 500),
      priority: frontmatter.priority ?? 'medium',
      status: frontmatter.status ?? 'pending',
      dependencies: frontmatter.dependencies,
      acceptanceCriteria: Array.isArray(frontmatter.acceptanceCriteria) 
        ? frontmatter.acceptanceCriteria 
        : undefined,
    })

    return result.success ? result.data : null
  }

  /**
   * Parse design markdown
   */
  private parseDesign(content: string, filename: string): SpecDesign | null {
    const { frontmatter, body } = this.parseMarkdown(content)
    const id = path.basename(filename, '.md')

    return {
      id,
      title: (frontmatter.title as string) ?? id,
      content: body,
      diagrams: Array.isArray(frontmatter.diagrams) ? frontmatter.diagrams : undefined,
    }
  }

  /**
   * Parse task markdown
   */
  private parseTask(content: string, filename: string): SpecTask | null {
    const { frontmatter, body } = this.parseMarkdown(content)
    const id = path.basename(filename, '.md')

    const result = SpecTaskSchema.safeParse({
      id,
      title: frontmatter.title ?? id,
      description: frontmatter.description ?? body.slice(0, 300),
      requirementId: frontmatter.requirementId ?? '',
      status: frontmatter.status ?? 'pending',
      priority: frontmatter.priority ?? 'medium',
      assignee: frontmatter.assignee,
      estimatedHours: frontmatter.estimatedHours,
      actualHours: frontmatter.actualHours,
      dependencies: frontmatter.dependencies,
      notes: Array.isArray(frontmatter.notes) ? frontmatter.notes : undefined,
    })

    return result.success ? result.data : null
  }

  /**
   * Parse markdown with frontmatter
   */
  private parseMarkdown(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)

    if (!match) {
      return { frontmatter: {}, body: content.trim() }
    }

    const frontmatterStr = match[1]!
    const body = match[2]!.trim()

    const frontmatter: Record<string, unknown> = {}
    for (const line of frontmatterStr.split('\n')) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        let value: unknown = line.slice(colonIndex + 1).trim()

        // Parse arrays
        if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
          value = value
            .slice(1, -1)
            .split(',')
            .map(v => v.trim().replace(/^["']|["']$/g, ''))
            .filter(v => v.length > 0)
        }

        // Parse booleans
        if (value === 'true') value = true
        if (value === 'false') value = false

        // Parse numbers
        if (typeof value === 'string' && /^\d+$/.test(value)) {
          value = parseInt(value, 10)
        }
        if (typeof value === 'string' && /^\d+\.\d+$/.test(value)) {
          value = parseFloat(value)
        }

        frontmatter[key] = value
      }
    }

    return { frontmatter, body }
  }

  /**
   * Calculate progress statistics
   */
  private calculateProgress(
    requirements: SpecRequirement[],
    tasks: SpecTask[]
  ): SpecDefinition['progress'] {
    const totalRequirements = requirements.length
    const completedRequirements = requirements.filter(r => r.status === 'completed').length
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => t.status === 'completed').length

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

  /**
   * Get specs directory path
   */
  getSpecsDir(): string {
    return this.specsDir
  }
}

// Singleton
let loaderInstance: SpecLoader | null = null

export function getSpecLoader(projectDir?: string): SpecLoader {
  if (!loaderInstance) {
    loaderInstance = new SpecLoader(projectDir)
  }
  return loaderInstance
}
