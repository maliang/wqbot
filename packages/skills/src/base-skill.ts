import type { Permission, SkillManifest, SkillInput, SkillOutput, SkillContext } from '@wqbot/core'
import { createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('base-skill')

export interface SkillExecuteParams {
  readonly input: SkillInput
  readonly permissions: readonly Permission[]
}

export abstract class BaseSkill {
  readonly manifest: SkillManifest

  constructor(manifest: SkillManifest) {
    this.manifest = manifest
  }

  get name(): string {
    return this.manifest.name
  }

  get version(): string {
    return this.manifest.version
  }

  get description(): string {
    return this.manifest.description
  }

  get requiredPermissions(): readonly Permission[] {
    return this.manifest.permissions
  }

  /**
   * Check if this skill matches the given input
   */
  matches(input: string): { matched: boolean; confidence: number } {
    const patterns = this.manifest.triggers.patterns

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'i')
        if (regex.test(input)) {
          return { matched: true, confidence: this.manifest.triggers.priority / 100 }
        }
      } catch (error) {
        logger.warn(`Invalid pattern in skill ${this.name}: ${pattern}`)
      }
    }

    // Check examples for fuzzy matching
    const normalizedInput = input.toLowerCase().trim()
    for (const example of this.manifest.triggers.examples) {
      const normalizedExample = example.toLowerCase().trim()
      if (normalizedInput.includes(normalizedExample) || normalizedExample.includes(normalizedInput)) {
        return { matched: true, confidence: 0.5 }
      }
    }

    return { matched: false, confidence: 0 }
  }

  /**
   * Validate that required permissions are granted
   */
  validatePermissions(grantedPermissions: readonly Permission[]): boolean {
    const grantedSet = new Set(grantedPermissions)
    return this.requiredPermissions.every((p) => grantedSet.has(p))
  }

  /**
   * Execute the skill
   */
  async execute(params: SkillExecuteParams): Promise<SkillOutput> {
    const { input, permissions } = params

    // Validate permissions
    if (!this.validatePermissions(permissions)) {
      const missing = this.requiredPermissions.filter(
        (p) => !permissions.includes(p)
      )
      return {
        success: false,
        error: `Missing required permissions: ${missing.join(', ')}`,
      }
    }

    logger.debug(`Executing skill: ${this.name}`, {
      skillName: this.name,
      command: input.command,
    })

    try {
      const result = await this.run(input)
      logger.debug(`Skill completed: ${this.name}`, {
        skillName: this.name,
        success: result.success,
      })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Skill failed: ${this.name}`, error instanceof Error ? error : undefined, {
        skillName: this.name,
      })
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Abstract method to be implemented by concrete skills
   */
  protected abstract run(input: SkillInput): Promise<SkillOutput>

  /**
   * Create a default context for testing
   */
  static createDefaultContext(overrides: Partial<SkillContext> = {}): SkillContext {
    return {
      conversationId: 'test',
      workingDirectory: process.cwd(),
      environment: {},
      ...overrides,
    }
  }
}
