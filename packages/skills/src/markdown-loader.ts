import * as fs from 'node:fs'
import * as path from 'node:path'
import { glob } from 'glob'
import matter from 'gray-matter'
import { getConfigManager, createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('markdown-loader')

export interface MarkdownSkillDef {
  readonly name: string
  readonly description: string
  readonly content: string
  readonly model?: string | undefined
  readonly subtask?: boolean | undefined
  readonly filePath: string
}

export class MarkdownSkillLoader {
  // 解析单个 SKILL.md 文件
  parseSkillFile(filePath: string): MarkdownSkillDef | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const { data, content } = matter(raw)

      const name = (data.name as string) || path.basename(path.dirname(filePath))
      if (!name) {
        logger.warn(`SKILL.md 缺少 name 字段: ${filePath}`)
        return null
      }

      return {
        name,
        description: (data.description as string) || '',
        content: content.trim(),
        model: data.model as string | undefined,
        subtask: data.subtask as boolean | undefined,
        filePath,
      }
    } catch (error) {
      logger.error(`解析 SKILL.md 失败: ${filePath}`, error instanceof Error ? error : undefined)
      return null
    }
  }

  // 扫描目录下所有 SKILL.md
  async scanDirectory(dir: string): Promise<MarkdownSkillDef[]> {
    if (!fs.existsSync(dir)) {
      return []
    }

    const files = await glob('**/SKILL.md', { cwd: dir })
    const skills: MarkdownSkillDef[] = []

    for (const file of files) {
      const fullPath = path.join(dir, file)
      const skill = this.parseSkillFile(fullPath)
      if (skill) {
        skills.push(skill)
      }
    }

    return skills
  }

  // 扫描所有技能目录（全局 + 项目），项目级覆盖同名全局
  async loadAll(): Promise<MarkdownSkillDef[]> {
    const config = getConfigManager()
    const globalDir = config.getSkillsDir()
    const projectDir = path.resolve('.wqbot', 'skills')

    const globalSkills = await this.scanDirectory(globalDir)
    const projectSkills = await this.scanDirectory(projectDir)

    // 项目级覆盖同名全局技能
    const skillMap = new Map<string, MarkdownSkillDef>()
    for (const skill of globalSkills) {
      skillMap.set(skill.name, skill)
    }
    for (const skill of projectSkills) {
      skillMap.set(skill.name, skill)
    }

    const result = [...skillMap.values()]
    logger.info(`加载了 ${result.length} 个 Markdown 技能`)
    return result
  }
}

// Singleton
let loaderInstance: MarkdownSkillLoader | null = null

export function getMarkdownSkillLoader(): MarkdownSkillLoader {
  if (!loaderInstance) {
    loaderInstance = new MarkdownSkillLoader()
  }
  return loaderInstance
}
