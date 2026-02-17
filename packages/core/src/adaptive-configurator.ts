import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { createModuleLogger, deepMerge } from '@wqbot/core'
import type { ProjectContext, IntentAnalysis, ResourceRequirements } from './orchestrator.js'

const logger = createModuleLogger('adaptive-configurator')

/**
 * Configuration item
 */
export interface ConfigItem {
  readonly key: string
  readonly value: unknown
  readonly source: 'default' | 'project' | 'user' | 'enterprise' | 'adaptive'
  readonly adaptive: boolean
}

/**
 * Resource configuration
 */
export interface ResourceConfig {
  readonly agents: Record<string, unknown>
  readonly skills: Record<string, unknown>
  readonly rules: Record<string, unknown>
  readonly hooks: Record<string, unknown>
  readonly mcp: Record<string, unknown>
}

/**
 * Adaptation recommendation
 */
export interface AdaptationRecommendation {
  readonly type: 'add' | 'modify' | 'remove'
  readonly target: 'agent' | 'skill' | 'rule' | 'hook' | 'mcp'
  readonly name: string
  readonly reason: string
  readonly config: Record<string, unknown>
  readonly priority: 'low' | 'medium' | 'high'
}

/**
 * Configuration snapshot
 */
export interface ConfigSnapshot {
  readonly timestamp: Date
  readonly context: ProjectContext
  readonly config: ResourceConfig
  readonly recommendations: readonly AdaptationRecommendation[]
}

/**
 * Adaptive Configurator - 动态调整资源配置
 */
export class AdaptiveConfigurator {
  private readonly configDir: string
  private snapshot: ConfigSnapshot | null = null
  private adaptationHistory: readonly AdaptationRecommendation[] = []

  constructor(projectRoot: string = process.cwd()) {
    this.configDir = path.join(projectRoot, '.wqbot')
  }

  /**
   * Analyze current configuration and provide recommendations
   */
  async analyzeAndRecommend(
    context: ProjectContext,
    intent: IntentAnalysis
  ): Promise<readonly AdaptationRecommendation[]> {
    const recommendations: AdaptationRecommendation[] = []

    // Analyze agents
    const agentRecs = await this.analyzeAgents(context, intent)
    recommendations.push(...agentRecs)

    // Analyze skills
    const skillRecs = await this.analyzeSkills(context, intent)
    recommendations.push(...skillRecs)

    // Analyze rules
    const ruleRecs = await this.analyzeRules(context, intent)
    recommendations.push(...ruleRecs)

    // Analyze hooks
    const hookRecs = await this.analyzeHooks(context, intent)
    recommendations.push(...hookRecs)

    // Analyze MCP
    const mcpRecs = await this.analyzeMCP(context, intent)
    recommendations.push(...mcpRecs)

    // Sort by priority
    recommendations.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.priority] - order[b.priority]
    })

    this.snapshot = {
      timestamp: new Date(),
      context,
      config: await this.loadCurrentConfig(),
      recommendations,
    }

    return recommendations
  }

  /**
   * Apply recommendations
   */
  async applyRecommendations(
    recommendations: readonly AdaptationRecommendation[],
    dryRun = false
  ): Promise<{ applied: string[]; failed: string[] }> {
    const applied: string[] = []
    const failed: string[] = []

    for (const rec of recommendations) {
      try {
        if (dryRun) {
          logger.info('[DRY RUN] Would apply', { type: rec.type, target: rec.target, name: rec.name })
          applied.push(rec.name)
        } else {
          await this.applyRecommendation(rec)
          logger.info('Applied recommendation', { type: rec.type, target: rec.target, name: rec.name })
          applied.push(rec.name)
        }
      } catch (error) {
        logger.error('Failed to apply recommendation', { 
          name: rec.name, 
          error: error instanceof Error ? error.message : String(error) 
        })
        failed.push(rec.name)
      }
    }

    this.adaptationHistory = [...this.adaptationHistory, ...recommendations.filter(r => applied.includes(r.name))]

    return { applied, failed }
  }

  /**
   * Get configuration snapshot
   */
  getSnapshot(): ConfigSnapshot | null {
    return this.snapshot
  }

  /**
   * Get adaptation history
   */
  getHistory(): readonly AdaptationRecommendation[] {
    return this.adaptationHistory
  }

  /**
   * Analyze agents for recommendations
   */
  private async analyzeAgents(
    context: ProjectContext,
    intent: IntentAnalysis
  ): Promise<AdaptationRecommendation[]> {
    const recs: AdaptationRecommendation[] = []

    // Check if we need a specialized agent for this task
    if (intent.suggestedAgents.length > 1) {
      recs.push({
        type: 'add',
        target: 'agent',
        name: `specialized-${intent.type}`,
        reason: `Task type ${intent.type} would benefit from a specialized agent`,
        config: {
          description: `Specialized agent for ${intent.type} tasks`,
          mode: intent.type === 'exploration' ? 'subagent' : 'primary',
          triggers: intent.suggestedSkills,
        },
        priority: 'medium',
      })
    }

    // Check for appropriate model based on complexity
    if (intent.complexity === 'critical' || intent.complexity === 'high') {
      recs.push({
        type: 'modify',
        target: 'agent',
        name: 'default',
        reason: 'High complexity task requires more capable model',
        config: {
          model: 'claude-opus-4-20250514',
          temperature: 0.3,
        },
        priority: 'high',
      })
    }

    return recs
  }

  /**
   * Analyze skills for recommendations
   */
  private async analyzeSkills(
    context: ProjectContext,
    intent: IntentAnalysis
  ): Promise<AdaptationRecommendation[]> {
    const recs: AdaptationRecommendation[] = []

    // Add testing skill if bug fix or testing
    if ((intent.type === 'bug_fix' || intent.type === 'testing') && context.hasTests) {
      recs.push({
        type: 'add',
        target: 'skill',
        name: 'test-runner',
        reason: 'Project has tests, enable test running capability',
        config: {
          command: 'npm test',
          triggers: ['run tests', '执行测试'],
        },
        priority: 'medium',
      })
    }

    // Add linting skill if project has linting
    if (context.hasLinting) {
      recs.push({
        type: 'add',
        target: 'skill',
        name: 'lint-checker',
        reason: 'Project has linting configuration',
        config: {
          command: this.getLintCommand(context),
          triggers: ['lint', '检查代码'],
        },
        priority: 'low',
      })
    }

    // Add type check skill if project has type checking
    if (context.hasTypeChecking) {
      recs.push({
        type: 'add',
        target: 'skill',
        name: 'type-checker',
        reason: 'Project has type checking',
        config: {
          command: this.getTypeCheckCommand(context),
          triggers: ['type check', '类型检查'],
        },
        priority: 'low',
      })
    }

    return recs
  }

  /**
   * Analyze rules for recommendations
   */
  private async analyzeRules(
    context: ProjectContext,
    intent: IntentAnalysis
  ): Promise<AdaptationRecommendation[]> {
    const recs: AdaptationRecommendation[] = []

    // Add security rules for code generation
    if (intent.type === 'code_generation' || intent.type === 'bug_fix') {
      recs.push({
        type: 'add',
        target: 'rule',
        name: 'security-rules',
        reason: 'Code generation tasks should follow security best practices',
        config: {
          description: 'Security rules for code generation',
          rules: [
            'no-hardcoded-credentials',
            'no-sql-injection',
            'no-xss-vulnerabilities',
          ],
        },
        priority: 'high',
      })
    }

    // Add refactoring rules for refactoring tasks
    if (intent.type === 'refactoring') {
      recs.push({
        type: 'add',
        target: 'rule',
        name: 'refactoring-rules',
        reason: 'Refactoring should maintain code quality',
        config: {
          description: 'Refactoring quality rules',
          rules: [
            'max-function-length: 50',
            'max-file-length: 800',
            'max-nesting-depth: 4',
          ],
        },
        priority: 'medium',
      })
    }

    return recs
  }

  /**
   * Analyze hooks for recommendations
   */
  private async analyzeHooks(
    context: ProjectContext,
    intent: IntentAnalysis
  ): Promise<AdaptationRecommendation[]> {
    const recs: AdaptationRecommendation[] = []

    // Add auto-format hook for code modifications
    if (intent.type === 'code_modification' || intent.type === 'code_generation') {
      recs.push({
        type: 'add',
        target: 'hook',
        name: 'auto-format',
        reason: 'Auto-format code after modifications',
        config: {
          event: 'tool:after',
          action: 'modify',
          tools: ['edit', 'write'],
          command: this.getFormatCommand(context),
        },
        priority: 'low',
      })
    }

    // Add security check hook for bug fixes
    if (intent.type === 'bug_fix') {
      recs.push({
        type: 'add',
        target: 'hook',
        name: 'security-scan',
        reason: 'Scan for security issues after bug fixes',
        config: {
          event: 'tool:after',
          action: 'warn',
          tools: ['edit', 'write'],
          patterns: ['password', 'secret', 'api_key', 'token'],
        },
        priority: 'medium',
      })
    }

    return recs
  }

  /**
   * Analyze MCP for recommendations
   */
  private async analyzeMCP(
    context: ProjectContext,
    intent: IntentAnalysis
  ): Promise<AdaptationRecommendation[]> {
    const recs: AdaptationRecommendation[] = []

    // Add GitHub MCP for project tasks
    if (intent.type === 'code_review' || intent.type === 'bug_fix') {
      recs.push({
        type: 'add',
        target: 'mcp',
        name: 'github',
        reason: 'GitHub integration useful for code review and bug tracking',
        config: {
          command: 'npx -y @modelcontextprotocol/server-github',
          description: 'GitHub integration for issues and PRs',
        },
        priority: 'low',
      })
    }

    // Add web search MCP for exploration
    if (intent.type === 'exploration' || intent.type === 'simple_qa') {
      recs.push({
        type: 'add',
        target: 'mcp',
        name: 'web-search',
        reason: 'Web search useful for exploration and research',
        config: {
          command: 'npx -y @modelcontextprotocol/server-brave-search',
          description: 'Web search capability',
        },
        priority: 'low',
      })
    }

    return recs
  }

  /**
   * Load current configuration
   */
  private async loadCurrentConfig(): Promise<ResourceConfig> {
    return {
      agents: await this.loadJsonSafe('agents.json', {}),
      skills: await this.loadJsonSafe('skills.json', {}),
      rules: await this.loadJsonSafe('rules.json', {}),
      hooks: await this.loadJsonSafe('hooks.json', {}),
      mcp: await this.loadJsonSafe('mcp.json', {}),
    }
  }

  /**
   * Load JSON file safely
   */
  private async loadJsonSafe(filename: string, defaultValue: unknown): Promise<unknown> {
    try {
      const filePath = path.join(this.configDir, filename)
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return defaultValue
    }
  }

  /**
   * Apply a single recommendation
   */
  private async applyRecommendation(rec: AdaptationRecommendation): Promise<void> {
    const configFile = `${rec.target}s.json`
    const filePath = path.join(this.configDir, configFile)

    let current = await this.loadJsonSafe(configFile, {})

    switch (rec.type) {
      case 'add':
        current = deepMerge(current as Record<string, unknown>, { [rec.name]: rec.config })
        break
      case 'modify':
        current = deepMerge(current as Record<string, unknown>, { [rec.name]: rec.config })
        break
      case 'remove':
        delete (current as Record<string, unknown>)[rec.name]
        break
    }

    await fs.writeFile(filePath, JSON.stringify(current, null, 2), 'utf-8')
  }

  /**
   * Get lint command for project
   */
  private getLintCommand(context: ProjectContext): string {
    switch (context.packageManager) {
      case 'pnpm': return 'pnpm lint'
      case 'yarn': return 'yarn lint'
      case 'poetry': return 'ruff check .'
      case 'cargo': return 'cargo clippy'
      default: return 'npm run lint'
    }
  }

  /**
   * Get type check command for project
   */
  private getTypeCheckCommand(context: ProjectContext): string {
    if (context.language === 'typescript') {
      switch (context.packageManager) {
        case 'pnpm': return 'pnpm tsc --noEmit'
        case 'yarn': return 'yarn tsc --noEmit'
        default: return 'npx tsc --noEmit'
      }
    }
    if (context.language === 'python') {
      return 'mypy .'
    }
    if (context.language === 'rust') {
      return 'cargo check'
    }
    return ''
  }

  /**
   * Get format command for project
   */
  private getFormatCommand(context: ProjectContext): string {
    switch (context.packageManager) {
      case 'pnpm': return 'pnpm format'
      case 'yarn': return 'yarn format'
      case 'poetry': return 'ruff format .'
      default: return 'npx prettier --write'
    }
  }
}

// Singleton
let configuratorInstance: AdaptiveConfigurator | null = null

export function getAdaptiveConfigurator(projectRoot?: string): AdaptiveConfigurator {
  if (!configuratorInstance) {
    configuratorInstance = new AdaptiveConfigurator(projectRoot)
  }
  return configuratorInstance
}

export async function adaptConfiguration(
  context: ProjectContext,
  intent: IntentAnalysis,
  projectRoot?: string
): Promise<readonly AdaptationRecommendation[]> {
  const configurator = new AdaptiveConfigurator(projectRoot)
  return configurator.analyzeAndRecommend(context, intent)
}

export type {
  ConfigItem,
  ResourceConfig,
  AdaptationRecommendation,
  ConfigSnapshot,
}
