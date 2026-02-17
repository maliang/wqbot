import { createModuleLogger } from '@wqbot/core'
import { getAgentLoader, type AgentDef, isReadonlyAgent, getAllowedTools, getDeniedTools } from './agent-loader.js'

const logger = createModuleLogger('agent-manager')

/**
 * Agent execution result for parallel execution
 */
export interface AgentExecutionResult<T = unknown> {
  readonly agentName: string
  readonly success: boolean
  readonly result?: T
  readonly error?: Error
  readonly duration: number
}

/**
 * Parallel execution options
 */
export interface ParallelExecutionOptions {
  /** Maximum concurrent agents */
  readonly concurrency?: number
  /** Stop on first error */
  readonly stopOnError?: boolean
  /** Timeout per agent in ms */
  readonly timeout?: number
}

export class AgentManager {
  private readonly agents: Map<string, AgentDef> = new Map()
  private readonly aliasMap: Map<string, string> = new Map()
  private initialized = false
  private currentAgent: AgentDef | null = null

  async initialize(): Promise<void> {
    if (this.initialized) return

    const loader = getAgentLoader()
    const agentDefs = await loader.loadAll()

    this.agents.clear()
    this.aliasMap.clear()

    for (const agent of agentDefs) {
      this.agents.set(agent.name, agent)
      
      // Build alias map
      if (agent.alias) {
        this.aliasMap.set(agent.alias, agent.name)
      }
    }

    // Set default agent (build or first primary)
    const buildAgent = this.getByAlias('build') ?? this.getPrimaryAgents()[0]
    if (buildAgent) {
      this.currentAgent = buildAgent
    }

    this.initialized = true
    logger.info(`Agent 管理器初始化完成: ${this.agents.size} 个 agent`)
  }

  getAll(): readonly AgentDef[] {
    return [...this.agents.values()]
  }

  get(name: string): AgentDef | undefined {
    return this.agents.get(name)
  }

  /**
   * Get agent by alias (build, plan, review, etc.)
   */
  getByAlias(alias: string): AgentDef | undefined {
    const name = this.aliasMap.get(alias)
    if (name) {
      return this.agents.get(name)
    }
    return undefined
  }

  /**
   * Get current active agent
   */
  getCurrent(): AgentDef | null {
    return this.currentAgent
  }

  /**
   * Switch to a different agent
   */
  switchTo(nameOrAlias: string): AgentDef | null {
    // Try by name first, then by alias
    let agent = this.agents.get(nameOrAlias)
    if (!agent) {
      agent = this.getByAlias(nameOrAlias)
    }

    if (agent) {
      this.currentAgent = agent
      logger.info(`切换到代理: ${agent.name} (${agent.alias ?? 'no alias'})`)
      return agent
    }

    logger.warn(`代理不存在: ${nameOrAlias}`)
    return null
  }

  /**
   * Toggle between build and plan agents (OpenCode style)
   */
  toggleBuildPlan(): AgentDef | null {
    const current = this.currentAgent
    
    // If current is build (or primary), switch to plan
    if (!current || current.alias === 'build' || current.mode === 'primary') {
      const planAgent = this.getByAlias('plan') ?? this.getSubagents()[0]
      if (planAgent) {
        return this.switchTo(planAgent.name)
      }
    }
    
    // Otherwise switch to build
    const buildAgent = this.getByAlias('build') ?? this.getPrimaryAgents()[0]
    if (buildAgent) {
      return this.switchTo(buildAgent.name)
    }

    return null
  }

  /**
   * Check if current agent is read-only
   */
  isCurrentReadonly(): boolean {
    return this.currentAgent ? isReadonlyAgent(this.currentAgent) : false
  }

  /**
   * Get allowed tools for current agent
   */
  getCurrentAllowedTools(): readonly string[] | undefined {
    return this.currentAgent ? getAllowedTools(this.currentAgent) : undefined
  }

  /**
   * Get denied tools for current agent
   */
  getCurrentDeniedTools(): readonly string[] {
    return this.currentAgent ? getDeniedTools(this.currentAgent) : []
  }

  // 匹配用户输入：@mention 或 triggers
  matchAgent(input: string): AgentDef | undefined {
    const trimmed = input.trim()

    // 1. 检查 @agent-name 前缀
    if (trimmed.startsWith('@')) {
      const spaceIdx = trimmed.indexOf(' ')
      const mentionName = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)
      
      // Try by name
      let agent = this.agents.get(mentionName)
      if (agent) {
        logger.debug(`Agent 匹配 (@mention): ${agent.name}`)
        return agent
      }
      
      // Try by alias
      agent = this.getByAlias(mentionName)
      if (agent) {
        logger.debug(`Agent 匹配 (@alias): ${mentionName} -> ${agent.name}`)
        return agent
      }
    }

    // 2. 遍历 triggers 数组，包含匹配
    for (const agent of this.agents.values()) {
      for (const trigger of agent.triggers) {
        if (trimmed.includes(trigger)) {
          logger.debug(`Agent 匹配 (trigger "${trigger}"): ${agent.name}`)
          return agent
        }
      }
    }

    return undefined
  }

  // 获取可见的 primary agent 列表（供 UI 展示）
  getVisible(): readonly AgentDef[] {
    return [...this.agents.values()].filter(
      a => !a.hidden && (a.mode === 'primary' || a.mode === 'all')
    )
  }

  /**
   * Get all primary agents
   */
  getPrimaryAgents(): readonly AgentDef[] {
    return [...this.agents.values()].filter(
      a => a.mode === 'primary' || a.mode === 'all'
    )
  }

  /**
   * Get all subagents
   */
  getSubagents(): readonly AgentDef[] {
    return [...this.agents.values()].filter(
      a => a.mode === 'subagent' || a.mode === 'review'
    )
  }

  /**
   * Get agents that can be used in parallel
   */
  getParallelCapable(): readonly AgentDef[] {
    return [...this.agents.values()].filter(a => !a.hidden)
  }

  /**
   * Execute multiple agents in parallel
   */
  async executeParallel<T>(
    agentNames: readonly string[],
    executor: (agent: AgentDef) => Promise<T>,
    options: ParallelExecutionOptions = {}
  ): Promise<AgentExecutionResult<T>[]> {
    const { concurrency = 3, stopOnError = false, timeout } = options

    const results: AgentExecutionResult<T>[] = []
    const executing: Promise<void>[] = []

    for (const name of agentNames) {
      const agent = this.agents.get(name)
      if (!agent) {
        results.push({
          agentName: name,
          success: false,
          error: new Error(`Agent not found: ${name}`),
          duration: 0,
        })
        continue
      }

      // Wait if at concurrency limit
      if (executing.length >= concurrency) {
        await Promise.race(executing)
      }

      const promise = this.executeWithTimeout(agent, executor, timeout)
        .then(result => {
          results.push(result)
        })
        .catch(error => {
          results.push({
            agentName: agent.name,
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            duration: 0,
          })
        })

      executing.push(promise as unknown as Promise<void>)

      // Remove completed promises
      const completed = executing.filter(async p => {
        try {
          await p
          return true
        } catch {
          return true
        }
      })
      executing.splice(0, executing.length - completed.length)

      if (stopOnError && results.some(r => !r.success)) {
        break
      }
    }

    await Promise.allSettled(executing)
    return results
  }

  /**
   * Execute agent with optional timeout
   */
  private async executeWithTimeout<T>(
    agent: AgentDef,
    executor: (agent: AgentDef) => Promise<T>,
    timeout?: number
  ): Promise<AgentExecutionResult<T>> {
    const startTime = Date.now()

    try {
      let result: T

      if (timeout) {
        result = await Promise.race([
          executor(agent),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          ),
        ])
      } else {
        result = await executor(agent)
      }

      return {
        agentName: agent.name,
        success: true,
        result,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      return {
        agentName: agent.name,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      }
    }
  }

  async reload(): Promise<void> {
    const loader = getAgentLoader()
    const agentDefs = await loader.loadAll()

    this.agents.clear()
    this.aliasMap.clear()

    for (const agent of agentDefs) {
      this.agents.set(agent.name, agent)
      if (agent.alias) {
        this.aliasMap.set(agent.alias, agent.name)
      }
    }

    logger.info(`Agent 管理器已重载: ${this.agents.size} 个 agent`)
  }
}

// Singleton
let managerInstance: AgentManager | null = null

export function getAgentManager(): AgentManager {
  if (!managerInstance) {
    managerInstance = new AgentManager()
  }
  return managerInstance
}

export async function initializeAgentManager(): Promise<AgentManager> {
  const manager = getAgentManager()
  await manager.initialize()
  return manager
}
