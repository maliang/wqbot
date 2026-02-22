import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { createModuleLogger } from './logger.js'
import { getConfigManager } from './config.js'
import type { IntentAnalysis, ProjectContext } from './orchestrator.js'

const logger = createModuleLogger('dynamic-agent-generator')

/**
 * Agent template for generation
 */
export interface AgentTemplate {
  readonly name: string
  readonly description: string
  readonly systemPrompt: string
  readonly tools: readonly string[]
  readonly model?: string
  readonly temperature?: number
  readonly mode: 'primary' | 'subagent' | 'all' | 'review'
  readonly triggers: readonly string[]
}

/**
 * Generated agent result
 */
export interface GeneratedAgent {
  readonly name: string
  readonly description: string
  readonly prompt: string
  readonly tools: readonly string[]
  readonly model?: string
  readonly mode: 'primary' | 'subagent' | 'all' | 'review'
  readonly filePath: string
  readonly isNew: boolean
}

/**
 * Agent adaptation suggestion
 */
export interface AgentAdaptation {
  readonly agentName: string
  readonly issue: string
  readonly suggestedChanges: string
  readonly priority: 'low' | 'medium' | 'high'
}

/**
 * Dynamic Agent Generator - 根据任务动态生成专用代理
 */
export class DynamicAgentGenerator {
  private readonly agentsDir: string
  private readonly projectAgentsDir: string

  constructor(projectRoot: string = process.cwd()) {
    this.agentsDir = path.join(os.homedir(), '.wqbot', 'agents')
    this.projectAgentsDir = path.join(projectRoot, '.wqbot', 'agents')
  }

  /**
   * Generate a specialized agent for a task
   */
  async generateForTask(
    intent: IntentAnalysis,
    context: ProjectContext
  ): Promise<GeneratedAgent> {
    const agentName = this.generateAgentName(intent.type, context)
    
    // Check if similar agent already exists
    const existing = await this.findSimilarAgent(intent, context)
    if (existing) {
      logger.info('Similar agent found', { existing: existing.name })
      return existing
    }

    // Generate new agent
    const template = this.buildAgentTemplate(intent, context)
    const filePath = await this.saveAgent(agentName, template)

    logger.info('Generated new agent', { name: agentName, path: filePath })

    return {
      name: agentName,
      description: template.description,
      prompt: template.systemPrompt,
      tools: template.tools,
      model: template.model,
      mode: template.mode,
      filePath,
      isNew: true,
    }
  }

  /**
   * Analyze existing agents and suggest adaptations
   */
  async analyzeAndAdapt(
    intent: IntentAnalysis,
    context: ProjectContext
  ): Promise<readonly AgentAdaptation[]> {
    const adaptations: AgentAdaptation[] = []
    
    // Load existing agents
    const existingAgents = await this.loadExistingAgents()
    
    for (const agent of existingAgents) {
      // Check if agent is suitable for current intent
      const adaptation = this.assessAgentSuitability(agent, intent, context)
      if (adaptation) {
        adaptations.push(adaptation)
      }
    }

    // Sort by priority
    adaptations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

    return adaptations
  }

  /**
   * Apply adaptations to agents
   */
  async applyAdaptations(adaptations: readonly AgentAdaptation[]): Promise<void> {
    for (const adaptation of adaptations) {
      if (adaptation.priority === 'high') {
        await this.applyHighPriorityAdaptation(adaptation)
      }
    }
  }

  /**
   * Generate agent name
   */
  private generateAgentName(intentType: string, context: ProjectContext): string {
    const prefix = intentType.replace(/_/g, '-')
    const lang = context.language.slice(0, 3)
    const timestamp = Date.now().toString(36).slice(-4)
    return `${prefix}-${lang}-${timestamp}`
  }

  /**
   * Build agent template from intent
   */
  private buildAgentTemplate(
    intent: IntentAnalysis,
    context: ProjectContext
  ): AgentTemplate {
    const mode = intent.type === 'exploration' ? 'subagent' : 
                 intent.type === 'code_review' ? 'review' : 'primary'

    return {
      name: '', // Will be set by caller
      description: this.buildDescription(intent, context),
      systemPrompt: this.buildSystemPrompt(intent, context),
      tools: intent.suggestedTools,
      model: intent.complexity === 'critical' ? 'claude-opus-4-20250514' : 
             intent.complexity === 'high' ? 'claude-sonnet-4-20250514' : undefined,
      temperature: intent.complexity === 'high' ? 0.3 : 0.7,
      mode,
      triggers: this.generateTriggers(intent),
    }
  }

  /**
   * Build agent description
   */
  private buildDescription(intent: IntentAnalysis, context: ProjectContext): string {
    const typeDescriptions: Record<string, string> = {
      bug_fix: 'Specialized in finding and fixing bugs',
      code_review: 'Code review expert focused on quality and security',
      refactoring: 'Refactoring specialist focused on code quality',
      testing: 'Testing expert focused on test coverage',
      code_generation: 'Code generation specialist',
      exploration: 'Codebase exploration expert',
      documentation: 'Documentation specialist',
      project_setup: 'Project setup and configuration expert',
    }

    const baseDesc = typeDescriptions[intent.type] ?? 'General purpose agent'
    return `${baseDesc} for ${context.language}/${context.framework ?? 'unknown'} projects`
  }

  /**
   * Build system prompt
   */
  private buildSystemPrompt(intent: IntentAnalysis, context: ProjectContext): string {
    const prompts: Record<string, string> = {
      bug_fix: `You are a bug fixing specialist. Your role is to:
1. Understand the bug description
2. Find the root cause through code analysis
3. Implement a minimal fix
4. Verify the fix works`,
      
      code_review: `You are a code review expert. Your role is to:
1. Review code for quality, readability, and performance
2. Check for security vulnerabilities
3. Suggest improvements
4. Ensure code follows best practices`,
      
      refactoring: `You are a refactoring specialist. Your role is to:
1. Understand the existing code
2. Identify refactoring opportunities
3. Make incremental improvements
4. Maintain functionality while improving structure`,
      
      testing: `You are a testing expert. Your role is to:
1. Write comprehensive tests
2. Ensure good test coverage
3. Use appropriate testing frameworks
4. Follow testing best practices`,
      
      exploration: `You are a codebase exploration expert. Your role is to:
1. Find files and code patterns
2. Understand code structure
3. Answer questions about the codebase
4. Provide accurate and thorough information`,
    }

    const basePrompt = prompts[intent.type] ?? `You are a specialized AI assistant for ${intent.type} tasks.`

    return `${basePrompt}

## Project Context
- Language: ${context.language}
- Framework: ${context.framework ?? 'unknown'}
- Package Manager: ${context.packageManager}
- Has Tests: ${context.hasTests}
- Has Linting: ${context.hasLinting}
- Has Type Checking: ${context.hasTypeChecking}

## Guidelines
- Always follow the project's coding standards
- Use appropriate tools for the task
- Consider security implications
- Write clean, maintainable code
- When in doubt, ask for clarification`
  }

  /**
   * Generate triggers for the agent
   */
  private generateTriggers(intent: IntentAnalysis): string[] {
    const triggers: Record<string, string[]> = {
      bug_fix: ['fix bug', 'debug', '修复 bug', '错误'],
      code_review: ['review', '审查', '检查代码'],
      refactoring: ['refactor', '重构', '优化代码'],
      testing: ['test', '测试', '写测试'],
      exploration: ['find', 'search', '查找', '搜索', 'where is'],
      documentation: ['doc', '文档', '说明'],
    }

    return triggers[intent.type] ?? []
  }

  /**
   * Find similar existing agent
   */
  private async findSimilarAgent(
    intent: IntentAnalysis,
    context: ProjectContext
  ): Promise<GeneratedAgent | null> {
    const existingAgents = await this.loadExistingAgents()

    for (const agent of existingAgents) {
      // Check if agent matches intent type
      const matchesType = agent.triggers.some(t => 
        intent.suggestedAgents.some(sa => t.toLowerCase().includes(sa.toLowerCase()))
      )

      if (matchesType) {
        return {
          ...agent,
          isNew: false,
        }
      }
    }

    return null
  }

  /**
   * Load existing agents
   */
  private async loadExistingAgents(): Promise<AgentTemplate[]> {
    const agents: AgentTemplate[] = []
    const dirs = [this.agentsDir, this.projectAgentsDir]

    for (const dir of dirs) {
      try {
        await fs.access(dir)
        const entries = await fs.readdir(dir)

        for (const entry of entries) {
          if (!entry.endsWith('.md')) continue

          const filePath = path.join(dir, entry)
          try {
            const content = await fs.readFile(filePath, 'utf-8')
            const agent = this.parseAgentFile(content, entry.replace('.md', ''))
            if (agent) {
              agents.push(agent)
            }
          } catch {
            // Skip invalid files
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    return agents
  }

  /**
   * Parse agent file
   */
  private parseAgentFile(content: string, name: string): AgentTemplate | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!frontmatterMatch) return null

    const frontmatter: Record<string, unknown> = {}
    for (const line of frontmatterMatch[1]!.split('\n')) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        frontmatter[key] = value
      }
    }

    return {
      name,
      description: (frontmatter.description as string) ?? '',
      systemPrompt: content.replace(frontmatterMatch[0], '').trim(),
      tools: (frontmatter.tools as string[]) ?? [],
      mode: (frontmatter.mode as 'primary' | 'subagent' | 'all' | 'review') ?? 'primary',
      triggers: (frontmatter.triggers as string[]) ?? [],
    }
  }

  /**
   * Save agent to file
   */
  private async saveAgent(name: string, template: AgentTemplate): Promise<string> {
    const dir = this.projectAgentsDir
    await fs.mkdir(dir, { recursive: true })

    const filePath = path.join(dir, `${name}.md`)
    const content = this.buildAgentMarkdown(name, template)

    await fs.writeFile(filePath, content, 'utf-8')

    return filePath
  }

  /**
   * Build agent markdown file
   */
  private buildAgentMarkdown(name: string, template: AgentTemplate): string {
    const frontmatter = [
      `name: ${name}`,
      `description: ${template.description}`,
      `mode: ${template.mode}`,
      template.model ? `model: ${template.model}` : null,
      template.temperature ? `temperature: ${template.temperature}` : null,
      `triggers: [${template.triggers.join(', ')}]`,
    ].filter(Boolean).join('\n')

    return `---
${frontmatter}
---

# ${template.name}

${template.systemPrompt}
`
  }

  /**
   * Assess if agent is suitable for intent
   */
  private assessAgentSuitability(
    agent: AgentTemplate,
    intent: IntentAnalysis,
    context: ProjectContext
  ): AgentAdaptation | null {
    // Check if agent uses outdated model
    if (agent.model && this.isOutdatedModel(agent.model)) {
      return {
        agentName: agent.name,
        issue: `Agent uses outdated model: ${agent.model}`,
        suggestedChanges: `Consider updating to a newer model like claude-sonnet-4-20250514`,
        priority: 'medium',
      }
    }

    // Check if agent is missing tools
    const missingTools = intent.suggestedTools.filter(t => !agent.tools.includes(t))
    if (missingTools.length > 0 && intent.type !== 'simple_qa') {
      return {
        agentName: agent.name,
        issue: `Agent may need additional tools: ${missingTools.join(', ')}`,
        suggestedChanges: `Add tools: ${missingTools.join(', ')}`,
        priority: 'low',
      }
    }

    return null
  }

  /**
   * Check if model is outdated
   */
  private isOutdatedModel(model: string): boolean {
    const outdatedModels = [
      'gpt-3.5-turbo',
      'gpt-4',
      'claude-2',
      'claude-2.1',
      'claude-3-opus',
      'claude-3-sonnet',
    ]
    return outdatedModels.some(m => model.toLowerCase().includes(m.toLowerCase()))
  }

  /**
   * Apply high priority adaptation
   */
  private async applyHighPriorityAdaptation(adaptation: AgentAdaptation): Promise<void> {
    logger.info('Applying high priority adaptation', { 
      agent: adaptation.agentName,
      change: adaptation.suggestedChanges,
    })
    // In real implementation, this would update the agent file
  }
}

// Singleton
let generatorInstance: DynamicAgentGenerator | null = null

export function getDynamicAgentGenerator(projectRoot?: string): DynamicAgentGenerator {
  if (!generatorInstance) {
    generatorInstance = new DynamicAgentGenerator(projectRoot)
  }
  return generatorInstance
}

export type {
  AgentTemplate,
  GeneratedAgent,
  AgentAdaptation,
}
