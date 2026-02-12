import * as fs from 'node:fs'
import * as path from 'node:path'
import { createModuleLogger, getConfigManager } from '@wqbot/core'
import type { SkillManifest } from '@wqbot/core'
import { getSkillRegistry } from './skill-registry.js'

const logger = createModuleLogger('skill-marketplace')

export type SkillSource = 'skills.sh' | 'github' | 'npm' | 'local'

export interface RemoteSkill {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly source: SkillSource
  readonly uri: string
  readonly downloads?: number | undefined
  readonly rating?: number | undefined
  readonly author?: string | undefined
}

export interface InstalledSkill {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly source: SkillSource
  readonly path: string
  readonly installedAt: Date
}

interface SkillsShSearchResponse {
  skills: Array<{
    name: string
    version: string
    description: string
    downloads: number
    rating: number
    author: string
  }>
}

export class SkillMarketplace {
  private readonly skillsShBaseUrl = 'https://api.skills.sh/v1'

  /**
   * Search for skills across multiple sources
   */
  async search(query: string, sources: SkillSource[] = ['skills.sh', 'npm']): Promise<RemoteSkill[]> {
    const results: RemoteSkill[] = []

    const searchPromises = sources.map(async (source) => {
      try {
        switch (source) {
          case 'skills.sh':
            return await this.searchSkillsSh(query)
          case 'npm':
            return await this.searchNpm(query)
          case 'github':
            return await this.searchGitHub(query)
          default:
            return []
        }
      } catch (error) {
        logger.warn(`Search failed for source ${source}`, { error })
        return []
      }
    })

    const searchResults = await Promise.all(searchPromises)
    for (const sourceResults of searchResults) {
      results.push(...sourceResults)
    }

    return results
  }

  private async searchSkillsSh(query: string): Promise<RemoteSkill[]> {
    try {
      const response = await fetch(
        `${this.skillsShBaseUrl}/skills/search?q=${encodeURIComponent(query)}`
      )

      if (!response.ok) {
        return []
      }

      const data = (await response.json()) as SkillsShSearchResponse

      return data.skills.map((s) => ({
        name: s.name,
        version: s.version,
        description: s.description,
        source: 'skills.sh' as const,
        uri: `@skills.sh/${s.name}`,
        downloads: s.downloads,
        rating: s.rating,
        author: s.author,
      }))
    } catch {
      return []
    }
  }

  private async searchNpm(query: string): Promise<RemoteSkill[]> {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=wqbot-skill-${encodeURIComponent(query)}&size=20`
      )

      if (!response.ok) {
        return []
      }

      const data = (await response.json()) as {
        objects: Array<{
          package: {
            name: string
            version: string
            description: string
            author?: { name: string }
          }
        }>
      }

      return data.objects.map((obj) => ({
        name: obj.package.name,
        version: obj.package.version,
        description: obj.package.description,
        source: 'npm' as const,
        uri: `npm:${obj.package.name}`,
        author: obj.package.author?.name,
      }))
    } catch {
      return []
    }
  }

  private async searchGitHub(_query: string): Promise<RemoteSkill[]> {
    // GitHub search would require authentication
    // For now, return empty array
    return []
  }

  /**
   * Install a skill from a URI
   */
  async install(skillUri: string): Promise<void> {
    const { source, identifier } = this.parseSkillUri(skillUri)

    logger.info(`Installing skill: ${skillUri}`, { source, identifier })

    switch (source) {
      case 'skills.sh':
        await this.installFromSkillsSh(identifier)
        break
      case 'npm':
        await this.installFromNpm(identifier)
        break
      case 'github':
        await this.installFromGitHub(identifier)
        break
      case 'local':
        await this.installFromLocal(identifier)
        break
      default:
        throw new Error(`Unknown skill source: ${source}`)
    }

    // Reload skill registry
    const registry = getSkillRegistry()
    await registry.initialize()
  }

  private parseSkillUri(uri: string): { source: SkillSource; identifier: string } {
    if (uri.startsWith('@skills.sh/')) {
      return { source: 'skills.sh', identifier: uri.slice(11) }
    }
    if (uri.startsWith('npm:')) {
      return { source: 'npm', identifier: uri.slice(4) }
    }
    if (uri.startsWith('github:')) {
      return { source: 'github', identifier: uri.slice(7) }
    }
    if (uri.startsWith('./') || uri.startsWith('/') || uri.startsWith('..')) {
      return { source: 'local', identifier: uri }
    }

    throw new Error(`Invalid skill URI: ${uri}`)
  }

  private async installFromSkillsSh(name: string): Promise<void> {
    const response = await fetch(`${this.skillsShBaseUrl}/skills/${name}/download`)

    if (!response.ok) {
      throw new Error(`Failed to download skill: ${name}`)
    }

    const skillData = await response.arrayBuffer()
    await this.extractAndInstall(name, Buffer.from(skillData))
  }

  private async installFromNpm(packageName: string): Promise<void> {
    const config = getConfigManager()
    const skillsDir = config.getSkillsDir()
    const targetDir = path.join(skillsDir, packageName.replace(/^wqbot-skill-/, ''))

    // Use npm to install the package
    const { execSync } = await import('node:child_process')
    execSync(`npm pack ${packageName}`, { cwd: skillsDir })

    // Extract the tarball
    const tarball = `${packageName.replace('/', '-').replace('@', '')}-*.tgz`
    execSync(`tar -xzf ${tarball} -C ${targetDir}`, { cwd: skillsDir })

    logger.info(`Installed skill from npm: ${packageName}`)
  }

  private async installFromGitHub(repo: string): Promise<void> {
    const config = getConfigManager()
    const skillsDir = config.getSkillsDir()
    const [owner, repoName] = repo.split('/')

    if (!owner || !repoName) {
      throw new Error(`Invalid GitHub repo: ${repo}`)
    }

    const targetDir = path.join(skillsDir, repoName)

    // Clone the repository
    const { execSync } = await import('node:child_process')
    execSync(`git clone --depth 1 https://github.com/${repo}.git ${targetDir}`)

    logger.info(`Installed skill from GitHub: ${repo}`)
  }

  private async installFromLocal(localPath: string): Promise<void> {
    const config = getConfigManager()
    const skillsDir = config.getSkillsDir()

    const absolutePath = path.resolve(localPath)
    const manifestPath = path.join(absolutePath, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No manifest.json found at: ${absolutePath}`)
    }

    const manifest = JSON.parse(
      await fs.promises.readFile(manifestPath, 'utf-8')
    ) as SkillManifest

    const targetDir = path.join(skillsDir, manifest.name)

    // Copy the skill directory
    await fs.promises.cp(absolutePath, targetDir, { recursive: true })

    logger.info(`Installed skill from local: ${localPath}`)
  }

  private async extractAndInstall(name: string, data: Buffer): Promise<void> {
    const config = getConfigManager()
    const skillsDir = config.getSkillsDir()
    const targetDir = path.join(skillsDir, name)

    await fs.promises.mkdir(targetDir, { recursive: true })

    // Extract tarball (assuming gzipped tar)
    const { execSync } = await import('node:child_process')
    const tempFile = path.join(skillsDir, `${name}.tgz`)

    await fs.promises.writeFile(tempFile, data)
    execSync(`tar -xzf ${tempFile} -C ${targetDir}`)
    await fs.promises.unlink(tempFile)
  }

  /**
   * Update an installed skill
   */
  async update(skillName: string): Promise<void> {
    const installed = await this.getInstalled(skillName)
    if (!installed) {
      throw new Error(`Skill not installed: ${skillName}`)
    }

    // Uninstall and reinstall
    await this.uninstall(skillName)

    const uri = this.buildUri(installed.source, skillName)
    await this.install(uri)
  }

  private buildUri(source: SkillSource, name: string): string {
    switch (source) {
      case 'skills.sh':
        return `@skills.sh/${name}`
      case 'npm':
        return `npm:${name}`
      case 'github':
        return `github:${name}`
      default:
        return name
    }
  }

  /**
   * Uninstall a skill
   */
  async uninstall(skillName: string): Promise<void> {
    const config = getConfigManager()
    const skillsDir = config.getSkillsDir()
    const skillPath = path.join(skillsDir, skillName)

    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill not found: ${skillName}`)
    }

    await fs.promises.rm(skillPath, { recursive: true })

    // Unregister from registry
    const registry = getSkillRegistry()
    registry.unregister(skillName)

    logger.info(`Uninstalled skill: ${skillName}`)
  }

  /**
   * List installed skills
   */
  async listInstalled(): Promise<InstalledSkill[]> {
    const config = getConfigManager()
    const skillsDir = config.getSkillsDir()

    if (!fs.existsSync(skillsDir)) {
      return []
    }

    const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true })
    const skills: InstalledSkill[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      const manifestPath = path.join(skillsDir, entry.name, 'manifest.json')
      if (!fs.existsSync(manifestPath)) {
        continue
      }

      const manifest = JSON.parse(
        await fs.promises.readFile(manifestPath, 'utf-8')
      ) as SkillManifest & { source?: SkillSource }

      const stat = await fs.promises.stat(manifestPath)

      skills.push({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        source: manifest.source ?? 'local',
        path: path.join(skillsDir, entry.name),
        installedAt: stat.mtime,
      })
    }

    return skills
  }

  private async getInstalled(skillName: string): Promise<InstalledSkill | undefined> {
    const installed = await this.listInstalled()
    return installed.find((s) => s.name === skillName)
  }

  /**
   * Create a new skill from template
   */
  async create(name: string, template = 'basic'): Promise<string> {
    const config = getConfigManager()
    const skillsDir = config.getSkillsDir()
    const targetDir = path.join(skillsDir, name)

    if (fs.existsSync(targetDir)) {
      throw new Error(`Skill already exists: ${name}`)
    }

    await fs.promises.mkdir(targetDir, { recursive: true })

    // Create manifest.json
    const manifest: SkillManifest = {
      name,
      version: '0.1.0',
      description: `A custom WQBot skill: ${name}`,
      keywords: [name],
      capabilities: [],
      triggers: {
        patterns: [`\\b${name}\\b`],
        examples: [`run ${name}`],
        priority: 50,
      },
      permissions: [],
      platforms: ['win32', 'darwin', 'linux'],
    }

    await fs.promises.writeFile(
      path.join(targetDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    )

    // Create index.ts template
    const indexContent = `import { BaseSkill, type SkillInput, type SkillOutput } from '@wqbot/skills'
import type { SkillManifest } from '@wqbot/core'

export default class ${this.toPascalCase(name)}Skill extends BaseSkill {
  constructor(manifest: SkillManifest) {
    super(manifest)
  }

  protected async run(input: SkillInput): Promise<SkillOutput> {
    // TODO: Implement your skill logic here
    return {
      success: true,
      data: {
        message: 'Hello from ${name}!',
        args: input.args,
      },
    }
  }
}
`

    await fs.promises.writeFile(path.join(targetDir, 'index.ts'), indexContent)

    logger.info(`Created new skill: ${name}`, { path: targetDir, template })

    return targetDir
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
  }
}

// Singleton instance
let marketplaceInstance: SkillMarketplace | null = null

export function getSkillMarketplace(): SkillMarketplace {
  if (!marketplaceInstance) {
    marketplaceInstance = new SkillMarketplace()
  }
  return marketplaceInstance
}
