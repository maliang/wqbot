import * as fs from 'node:fs'
import * as path from 'node:path'
import { glob } from 'glob'
import matter from 'gray-matter'
import { z } from 'zod'
import { getConfigManager, createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('agent-loader')

export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  mode: z.enum(['primary', 'subagent', 'all']).default('all'),
  model: z.string().optional(),
  temperature: z.number().optional(),
  color: z.string().optional(),
  hidden: z.boolean().default(false),
  triggers: z.array(z.string()).default([]),
})

export interface AgentDef {
  readonly name: string
  readonly description: string
  readonly prompt: string
  readonly mode: 'primary' | 'subagent' | 'all'
  readonly model?: string | undefined
  readonly temperature?: number | undefined
  readonly color?: string | undefined
  readonly hidden: boolean
  readonly triggers: readonly string[]
  readonly filePath: string
}

export class AgentLoader {
  // 解析单个 agent 文件
  parseAgentFile(filePath: string): AgentDef | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const { data, content } = matter(raw)

      const parsed = AgentConfigSchema.safeParse(data)
      if (!parsed.success) {
        logger.warn(`Agent 配置无效: ${filePath}`, { errors: parsed.error.issues })
        return null
      }

      const config = parsed.data

      return {
        name: config.name,
        description: config.description,
        prompt: content.trim(),
        mode: config.mode,
        model: config.model,
        temperature: config.temperature,
        color: config.color,
        hidden: config.hidden,
        triggers: config.triggers,
        filePath,
      }
    } catch (error) {
      logger.error(`解析 Agent 文件失败: ${filePath}`, error instanceof Error ? error : undefined)
      return null
    }
  }

  // 扫描指定目录
  async scanDirectory(dir: string): Promise<AgentDef[]> {
    if (!fs.existsSync(dir)) {
      return []
    }

    const files = await glob('*.md', { cwd: dir })
    const agents: AgentDef[] = []

    for (const file of files) {
      const fullPath = path.join(dir, file)
      const agent = this.parseAgentFile(fullPath)
      if (agent) {
        agents.push(agent)
      }
    }

    return agents
  }

  // 扫描所有 agent 目录（全局 + 项目），项目级覆盖同名全局
  async loadAll(): Promise<AgentDef[]> {
    const config = getConfigManager()
    const globalDir = config.getAgentsDir()
    const projectDir = path.resolve('.wqbot', 'agents')

    const globalAgents = await this.scanDirectory(globalDir)
    const projectAgents = await this.scanDirectory(projectDir)

    // 项目级覆盖同名全局 agent
    const agentMap = new Map<string, AgentDef>()
    for (const agent of globalAgents) {
      agentMap.set(agent.name, agent)
    }
    for (const agent of projectAgents) {
      agentMap.set(agent.name, agent)
    }

    const result = [...agentMap.values()]
    logger.info(`加载了 ${result.length} 个 Agent`)
    return result
  }
}

// Singleton
let loaderInstance: AgentLoader | null = null

export function getAgentLoader(): AgentLoader {
  if (!loaderInstance) {
    loaderInstance = new AgentLoader()
  }
  return loaderInstance
}
