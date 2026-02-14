import * as fs from 'node:fs'
import * as path from 'node:path'
import { glob } from 'glob'
import type { SkillManifest, Permission } from '@wqbot/core'
import { getConfigManager, createModuleLogger } from '@wqbot/core'
import { BaseSkill, type SkillExecuteParams } from './base-skill.js'
import { getMarkdownSkillLoader, type MarkdownSkillDef } from './markdown-loader.js'
import { getToolRegistry } from './tool-registry.js'

const logger = createModuleLogger('skill-registry')

interface RegisteredSkill {
  readonly skill: BaseSkill
  readonly path: string
  readonly isBuiltin: boolean
}

export class SkillRegistry {
  private readonly skills: Map<string, RegisteredSkill> = new Map()
  private readonly disabledSkills: Set<string> = new Set()
  private markdownSkills: readonly MarkdownSkillDef[] = []
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    // Load built-in skills
    await this.loadBuiltinSkills()

    // Load user-installed skills
    await this.loadUserSkills()

    // Load Markdown skills
    await this.loadMarkdownSkills()

    this.initialized = true
    logger.info(`Skill registry initialized with ${this.skills.size} skills, ${this.markdownSkills.length} markdown skills`)
  }

  private async loadBuiltinSkills(): Promise<void> {
    logger.debug('Loading built-in skills')
  }

  private async loadUserSkills(): Promise<void> {
    const config = getConfigManager()
    const skillsDir = config.getSkillsDir()

    if (!fs.existsSync(skillsDir)) {
      return
    }

    const manifestPaths = await glob('*/manifest.json', { cwd: skillsDir })

    for (const manifestPath of manifestPaths) {
      const fullPath = path.join(skillsDir, manifestPath)
      await this.loadSkillFromManifest(fullPath, false)
    }
  }

  private async loadMarkdownSkills(): Promise<void> {
    const loader = getMarkdownSkillLoader()
    this.markdownSkills = await loader.loadAll()

    // 注册 Markdown 技能到 ToolRegistry
    if (this.markdownSkills.length > 0) {
      const toolRegistry = getToolRegistry()
      const skills = this.markdownSkills

      toolRegistry.register({
        name: 'load_skill',
        description: `加载专业技能。可用技能:\n${skills.map(s => `- ${s.name}: ${s.description}`).join('\n')}`,
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '技能名称' },
          },
          required: ['name'],
        },
        source: 'skill',
        execute: async (args: Record<string, unknown>) => {
          const skill = skills.find(s => s.name === args.name)
          if (!skill) {
            return { content: `技能不存在: ${args.name}`, isError: true }
          }
          return { content: skill.content }
        },
      })

      logger.info(`已注册 ${skills.length} 个 Markdown 技能到 ToolRegistry`)
    }
  }

  private async loadSkillFromManifest(manifestPath: string, isBuiltin: boolean): Promise<void> {
    try {
      const content = await fs.promises.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(content) as SkillManifest

      const skillDir = path.dirname(manifestPath)
      const entryPoint = path.join(skillDir, 'index.js')

      if (!fs.existsSync(entryPoint)) {
        logger.warn(`Skill entry point not found: ${entryPoint}`)
        return
      }

      // Dynamic import of the skill module
      const module = await import(`file://${entryPoint}`)
      const SkillClass = module.default as new (manifest: SkillManifest) => BaseSkill

      const skill = new SkillClass(manifest)

      this.register(skill, skillDir, isBuiltin)
    } catch (error) {
      logger.error(`Failed to load skill from ${manifestPath}`, error instanceof Error ? error : undefined)
    }
  }

  register(skill: BaseSkill, skillPath: string, isBuiltin = false): void {
    if (this.skills.has(skill.name)) {
      logger.warn(`Skill already registered: ${skill.name}`)
      return
    }

    this.skills.set(skill.name, {
      skill,
      path: skillPath,
      isBuiltin,
    })

    logger.debug(`Registered skill: ${skill.name}`, {
      skillName: skill.name,
      version: skill.version,
      isBuiltin,
    })
  }

  unregister(skillName: string): boolean {
    const registered = this.skills.get(skillName)
    if (!registered) {
      return false
    }

    if (registered.isBuiltin) {
      logger.warn(`Cannot unregister built-in skill: ${skillName}`)
      return false
    }

    this.skills.delete(skillName)
    logger.debug(`Unregistered skill: ${skillName}`)
    return true
  }

  get(skillName: string): BaseSkill | undefined {
    return this.skills.get(skillName)?.skill
  }

  getAll(): readonly BaseSkill[] {
    return [...this.skills.values()]
      .filter(r => !this.disabledSkills.has(r.skill.name))
      .map((r) => r.skill)
  }

  getBuiltin(): readonly BaseSkill[] {
    return [...this.skills.values()]
      .filter((r) => r.isBuiltin)
      .map((r) => r.skill)
  }

  getUserInstalled(): readonly BaseSkill[] {
    return [...this.skills.values()]
      .filter((r) => !r.isBuiltin)
      .map((r) => r.skill)
  }

  /**
   * Find skills that match the given input
   */
  findMatching(input: string): Array<{ skill: BaseSkill; confidence: number }> {
    const matches: Array<{ skill: BaseSkill; confidence: number }> = []

    for (const { skill } of this.skills.values()) {
      if (this.disabledSkills.has(skill.name)) continue
      const { matched, confidence } = skill.matches(input)
      if (matched) {
        matches.push({ skill, confidence })
      }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Execute a skill by name
   */
  async execute(
    skillName: string,
    params: SkillExecuteParams
  ): Promise<{ success: boolean; data?: unknown | undefined; error?: string | undefined }> {
    if (this.disabledSkills.has(skillName)) {
      return { success: false, error: `Skill is disabled: ${skillName}` }
    }

    const skill = this.get(skillName)
    if (!skill) {
      return { success: false, error: `Skill not found: ${skillName}` }
    }

    return skill.execute(params)
  }

  /**
   * Get required permissions for a skill
   */
  getRequiredPermissions(skillName: string): readonly Permission[] {
    const skill = this.get(skillName)
    return skill?.requiredPermissions ?? []
  }

  enable(skillName: string): boolean {
    if (!this.disabledSkills.has(skillName)) return false
    this.disabledSkills.delete(skillName)
    logger.info(`Skill enabled: ${skillName}`)
    return true
  }

  disable(skillName: string): boolean {
    if (!this.skills.has(skillName)) return false
    this.disabledSkills.add(skillName)
    logger.info(`Skill disabled: ${skillName}`)
    return true
  }

  isEnabled(skillName: string): boolean {
    return !this.disabledSkills.has(skillName)
  }

  async reload(): Promise<void> {
    // 保留内置技能和禁用状态
    const builtinSkills = new Map<string, RegisteredSkill>()
    for (const [name, reg] of this.skills) {
      if (reg.isBuiltin) builtinSkills.set(name, reg)
    }

    // 清空非内置技能
    this.skills.clear()
    for (const [name, reg] of builtinSkills) {
      this.skills.set(name, reg)
    }

    // 重新加载用户技能和 Markdown 技能
    await this.loadUserSkills()
    await this.loadMarkdownSkills()

    logger.info(`Skill registry reloaded: ${this.skills.size} skills, ${this.markdownSkills.length} markdown skills`)
  }
}

// Singleton instance
let registryInstance: SkillRegistry | null = null

export function getSkillRegistry(): SkillRegistry {
  if (!registryInstance) {
    registryInstance = new SkillRegistry()
  }
  return registryInstance
}

export async function initializeSkillRegistry(): Promise<SkillRegistry> {
  const registry = getSkillRegistry()
  await registry.initialize()
  return registry
}
