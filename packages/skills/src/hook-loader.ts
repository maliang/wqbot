import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { createModuleLogger } from '@wqbot/core'
import { HookConfigSchema, type HookConfig, type Hook, type HookHandler } from './hook-types.js'

const logger = createModuleLogger('hook-loader')

/**
 * Load hooks from markdown files
 * Format similar to agents: frontmatter + body
 */
export class HookLoader {
  private readonly globalHooksDir: string
  private readonly projectHooksDir: string

  constructor(projectDir: string = process.cwd()) {
    this.globalHooksDir = path.join(os.homedir(), '.wqbot', 'hooks')
    this.projectHooksDir = path.join(projectDir, '.wqbot', 'hooks')
  }

  /**
   * Load all hooks from global and project directories
   */
  async loadAll(): Promise<Hook[]> {
    const hooks: Hook[] = []

    // Load global hooks
    const globalHooks = await this.loadFromDir(this.globalHooksDir, 'global')
    hooks.push(...globalHooks)

    // Load project hooks (can override global)
    const projectHooks = await this.loadFromDir(this.projectHooksDir, 'project')
    
    // Project hooks override global hooks with same name
    for (const projectHook of projectHooks) {
      const existingIndex = hooks.findIndex(h => h.name === projectHook.name)
      if (existingIndex >= 0) {
        logger.debug(`Project hook overriding global hook: ${projectHook.name}`)
        hooks[existingIndex] = projectHook
      } else {
        hooks.push(projectHook)
      }
    }

    logger.info(`Loaded ${hooks.length} hooks (${globalHooks.length} global, ${projectHooks.length} project)`)
    return hooks
  }

  /**
   * Load hooks from a directory
   */
  private async loadFromDir(dir: string, source: 'global' | 'project'): Promise<Hook[]> {
    const hooks: Hook[] = []

    try {
      await fs.access(dir)
    } catch {
      return hooks
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue
      }

      const filePath = path.join(dir, entry.name)
      try {
        const hook = await this.loadFile(filePath, source)
        if (hook) {
          hooks.push(hook)
        }
      } catch (error) {
        logger.error(`Failed to load hook: ${filePath}`, error instanceof Error ? error : undefined)
      }
    }

    return hooks
  }

  /**
   * Load a single hook file
   */
  private async loadFile(filePath: string, source: 'global' | 'project'): Promise<Hook | null> {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = this.parseMarkdown(content)

    if (!parsed.frontmatter) {
      logger.warn(`Hook file missing frontmatter: ${filePath}`)
      return null
    }

    const parseResult = HookConfigSchema.safeParse(parsed.frontmatter)
    if (!parseResult.success) {
      logger.warn(`Invalid hook config in ${filePath}`, { errors: parseResult.error.errors })
      return null
    }

    const config = parseResult.data
    const id = this.generateId(filePath, source)

    // Compile regex patterns
    const compiledPatterns = config.patterns?.map(p => {
      try {
        return new RegExp(p, 'gi')
      } catch {
        logger.warn(`Invalid regex pattern in hook ${config.name}: ${p}`)
        return null
      }
    }).filter((p): p is RegExp => p !== null)

    // Parse handler from body if present
    const handler = this.parseHandler(parsed.body)

    return {
      ...config,
      id,
      source,
      compiledPatterns,
      handler,
    }
  }

  /**
   * Parse markdown with frontmatter
   */
  private parseMarkdown(content: string): { frontmatter: Record<string, unknown> | null; body: string } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)

    if (!match) {
      return { frontmatter: null, body: content }
    }

    const frontmatterStr = match[1]!
    const body = match[2]!

    // Simple YAML parsing
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

        frontmatter[key] = value
      }
    }

    return { frontmatter, body }
  }

  /**
   * Parse handler from body (TypeScript/JavaScript code block)
   */
  private parseHandler(body: string): HookHandler | undefined {
    const codeBlockRegex = /```(?:typescript|javascript|js|ts)\s*\n([\s\S]*?)```/
    const match = body.match(codeBlockRegex)

    if (!match) {
      return undefined
    }

    // Return a placeholder - actual execution would need a sandbox
    // For now, hooks without handlers just use pattern matching
    return undefined
  }

  /**
   * Generate unique hook ID
   */
  private generateId(filePath: string, source: 'global' | 'project'): string {
    const basename = path.basename(filePath, '.md')
    return `${source}:${basename}`
  }

  /**
   * Get hooks directories
   */
  getDirectories(): { global: string; project: string } {
    return {
      global: this.globalHooksDir,
      project: this.projectHooksDir,
    }
  }
}

// Singleton
let loaderInstance: HookLoader | null = null

export function getHookLoader(projectDir?: string): HookLoader {
  if (!loaderInstance) {
    loaderInstance = new HookLoader(projectDir)
  }
  return loaderInstance
}
