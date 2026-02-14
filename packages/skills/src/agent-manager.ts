import { createModuleLogger } from '@wqbot/core'
import { getAgentLoader, type AgentDef } from './agent-loader.js'

const logger = createModuleLogger('agent-manager')

export class AgentManager {
  private readonly agents: Map<string, AgentDef> = new Map()
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    const loader = getAgentLoader()
    const agentDefs = await loader.loadAll()

    for (const agent of agentDefs) {
      this.agents.set(agent.name, agent)
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

  // 匹配用户输入：@mention 或 triggers
  matchAgent(input: string): AgentDef | undefined {
    const trimmed = input.trim()

    // 1. 检查 @agent-name 前缀
    if (trimmed.startsWith('@')) {
      const spaceIdx = trimmed.indexOf(' ')
      const mentionName = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)
      const agent = this.agents.get(mentionName)
      if (agent) {
        logger.debug(`Agent 匹配 (@mention): ${agent.name}`)
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

  async reload(): Promise<void> {
    const loader = getAgentLoader()
    const agentDefs = await loader.loadAll()

    this.agents.clear()
    for (const agent of agentDefs) {
      this.agents.set(agent.name, agent)
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
