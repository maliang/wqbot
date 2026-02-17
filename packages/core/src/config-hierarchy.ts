import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { createModuleLogger, deepMerge } from '@wqbot/core'

const logger = createModuleLogger('config-hierarchy')

/**
 * Configuration scope levels
 */
export type ConfigScope = 'project' | 'user' | 'enterprise'

/**
 * Configuration layer
 */
export interface ConfigLayer {
  readonly scope: ConfigScope
  readonly path: string
  readonly config: Record<string, unknown>
  readonly priority: number
}

/**
 * Configuration hierarchy options
 */
export interface ConfigHierarchyOptions {
  readonly projectDir?: string
  readonly enterpriseConfigPath?: string
}

/**
 * Enterprise policy settings
 */
export interface EnterprisePolicy {
  /** Force specific settings that cannot be overridden */
  readonly forcedSettings?: Record<string, unknown>
  /** Disallowed settings at user/project level */
  readonly disallowedSettings?: string[]
  /** Require approval for certain actions */
  readonly requireApproval?: string[]
}

/**
 * Merged configuration result
 */
export interface MergedConfig {
  readonly config: Record<string, unknown>
  readonly layers: ConfigLayer[]
  readonly sources: Record<string, ConfigScope>
  readonly policies?: EnterprisePolicy
}

/**
 * Configuration hierarchy manager
 * Handles project → user → enterprise configuration inheritance
 */
export class ConfigHierarchy {
  private readonly projectDir: string
  private readonly userConfigDir: string
  private readonly enterpriseConfigPath: string | null

  constructor(options: ConfigHierarchyOptions = {}) {
    this.projectDir = options.projectDir ?? process.cwd()
    this.userConfigDir = path.join(os.homedir(), '.wqbot')
    this.enterpriseConfigPath = options.enterpriseConfigPath ?? null
  }

  /**
   * Load all configuration layers and merge them
   */
  async load(): Promise<MergedConfig> {
    const layers: ConfigLayer[] = []

    // Load enterprise config (highest priority)
    const enterpriseLayer = await this.loadEnterpriseConfig()
    if (enterpriseLayer) {
      layers.push(enterpriseLayer)
    }

    // Load user config (medium priority)
    const userLayer = await this.loadUserConfig()
    if (userLayer) {
      layers.push(userLayer)
    }

    // Load project config (lowest priority)
    const projectLayer = await this.loadProjectConfig()
    if (projectLayer) {
      layers.push(projectLayer)
    }

    // Sort by priority (higher first)
    layers.sort((a, b) => b.priority - a.priority)

    // Merge configs
    const merged = this.mergeLayers(layers)

    // Track sources
    const sources = this.trackSources(layers)

    return {
      config: merged,
      layers,
      sources,
      policies: enterpriseLayer?.config.policies as EnterprisePolicy | undefined,
    }
  }

  /**
   * Load enterprise configuration
   */
  private async loadEnterpriseConfig(): Promise<ConfigLayer | null> {
    if (!this.enterpriseConfigPath) return null

    try {
      const content = await fs.readFile(this.enterpriseConfigPath, 'utf-8')
      const config = JSON.parse(content)

      logger.info('Loaded enterprise config', { path: this.enterpriseConfigPath })

      return {
        scope: 'enterprise',
        path: this.enterpriseConfigPath,
        config,
        priority: 100,
      }
    } catch {
      logger.debug('No enterprise config found')
      return null
    }
  }

  /**
   * Load user configuration
   */
  private async loadUserConfig(): Promise<ConfigLayer | null> {
    const configPath = path.join(this.userConfigDir, 'config.yaml')

    try {
      const content = await fs.readFile(configPath, 'utf-8')
      const config = this.parseYaml(content)

      logger.debug('Loaded user config', { path: configPath })

      return {
        scope: 'user',
        path: configPath,
        config,
        priority: 50,
      }
    } catch {
      logger.debug('No user config found')
      return null
    }
  }

  /**
   * Load project configuration
   */
  private async loadProjectConfig(): Promise<ConfigLayer | null> {
    const configPath = path.join(this.projectDir, '.wqbot', 'config.yaml')

    try {
      const content = await fs.readFile(configPath, 'utf-8')
      const config = this.parseYaml(content)

      logger.debug('Loaded project config', { path: configPath })

      return {
        scope: 'project',
        path: configPath,
        config,
        priority: 10,
      }
    } catch {
      logger.debug('No project config found')
      return null
    }
  }

  /**
   * Merge configuration layers
   */
  private mergeLayers(layers: ConfigLayer[]): Record<string, unknown> {
    let merged: Record<string, unknown> = {}

    // Merge in reverse order (lowest priority first)
    for (const layer of [...layers].reverse()) {
      // Check for enterprise policy restrictions
      if (this.hasPolicyRestrictions(layer, layers)) {
        logger.warn(`Config layer blocked by enterprise policy`, { scope: layer.scope })
        continue
      }

      merged = deepMerge(merged, layer.config)
    }

    return merged
  }

  /**
   * Check if a layer has policy restrictions
   */
  private hasPolicyRestrictions(layer: ConfigLayer, allLayers: ConfigLayer[]): boolean {
    const enterpriseLayer = allLayers.find(l => l.scope === 'enterprise')
    if (!enterpriseLayer) return false

    const policies = enterpriseLayer.config.policies as EnterprisePolicy | undefined
    if (!policies) return false

    // Check for forced settings
    if (policies.forcedSettings) {
      for (const key of Object.keys(policies.forcedSettings)) {
        if (layer.config[key] !== undefined) {
          // This setting is forced by enterprise, ignore lower-level override
          return true
        }
      }
    }

    return false
  }

  /**
   * Track which scope each config value comes from
   */
  private trackSources(layers: ConfigLayer[]): Record<string, ConfigScope> {
    const sources: Record<string, ConfigScope> = {}

    for (const layer of layers) {
      for (const key of Object.keys(layer.config)) {
        if (!sources[key]) {
          sources[key] = layer.scope
        }
      }
    }

    return sources
  }

  /**
   * Simple YAML parser (for basic configs)
   */
  private parseYaml(content: string): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    let currentKey = ''
    let currentIndent = 0

    for (const line of content.split('\n')) {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || line.trim() === '') continue

      const indent = line.search(/\S/)
      const [keyPart, ...valueParts] = line.trim().split(':')
      const key = keyPart?.trim()
      let value = valueParts.join(':').trim()

      if (!key) continue

      // Parse value
      if (value === '') {
        // Nested object
        currentKey = key
        currentIndent = indent
        result[key] = {}
      } else {
        // Remove quotes
        value = value.replace(/^["']|["']$/g, '')

        // Parse arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value
            .slice(1, -1)
            .split(',')
            .map(v => v.trim().replace(/^["']|["']$/g, ''))
        }

        // Parse booleans
        if (value === 'true') value = true
        if (value === 'false') value = false

        // Parse numbers
        if (typeof value === 'string' && /^\d+$/.test(value)) {
          value = parseInt(value, 10)
        }

        if (indent > currentIndent && currentKey) {
          ;(result[currentKey] as Record<string, unknown>)[key] = value
        } else {
          result[key] = value
        }
      }
    }

    return result
  }

  /**
   * Get configuration directories
   */
  getDirectories(): { project: string; user: string; enterprise: string | null } {
    return {
      project: path.join(this.projectDir, '.wqbot'),
      user: this.userConfigDir,
      enterprise: this.enterpriseConfigPath,
    }
  }

  /**
   * Check if a setting can be modified at a given scope
   */
  canModify(key: string, scope: ConfigScope, layers: ConfigLayer[]): boolean {
    const enterpriseLayer = layers.find(l => l.scope === 'enterprise')
    if (!enterpriseLayer) return true

    const policies = enterpriseLayer.config.policies as EnterprisePolicy | undefined
    if (!policies) return true

    // Check forced settings
    if (policies.forcedSettings && key in policies.forcedSettings) {
      return false
    }

    // Check disallowed settings
    if (policies.disallowedSettings?.includes(key)) {
      return scope === 'enterprise'
    }

    return true
  }
}

// Singleton
let hierarchyInstance: ConfigHierarchy | null = null

export function getConfigHierarchy(options?: ConfigHierarchyOptions): ConfigHierarchy {
  if (!hierarchyInstance) {
    hierarchyInstance = new ConfigHierarchy(options)
  }
  return hierarchyInstance
}

export async function loadMergedConfig(options?: ConfigHierarchyOptions): Promise<MergedConfig> {
  const hierarchy = new ConfigHierarchy(options)
  return hierarchy.load()
}
