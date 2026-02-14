import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { RoutingStrategy, ModelProvider, TaskType } from './types.js'
import {
  loadConfig,
  saveConfig,
  type AppConfig,
  type KnowledgeConfig,
  type McpServerConfig,
} from './api-config.js'

// 兼容导出
export { type AppConfig, type KnowledgeConfig, type McpServerConfig }

export class ConfigManager {
  private config: AppConfig | null = null
  private readonly configDir: string

  constructor() {
    this.configDir = this.getConfigDir()
  }

  private getConfigDir(): string {
    return path.join(os.homedir(), '.wqbot')
  }

  getDataDir(): string {
    return this.config?.dataDir ?? path.join(this.configDir, 'data')
  }

  getSkillsDir(): string {
    return this.config?.skillsDir ?? path.join(this.configDir, 'skills')
  }

  getAgentsDir(): string {
    return path.join(this.configDir, 'agents')
  }

  getLogFile(): string | undefined {
    return this.config?.logFile
  }

  async initialize(): Promise<void> {
    await this.ensureDirs()
    this.config = await loadConfig()
  }

  async reload(): Promise<void> {
    this.config = await loadConfig()
  }

  private async ensureDirs(): Promise<void> {
    const dirs = [this.configDir, this.getDataDir(), this.getSkillsDir(), this.getAgentsDir()]
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
    }
  }

  getConfig(): AppConfig {
    return this.config!
  }

  getRoutingStrategy(): RoutingStrategy {
    return this.config?.routing?.strategy ?? 'balanced'
  }

  getModelsForTask(taskType: TaskType): readonly string[] {
    return this.config?.routing?.taskMapping?.[taskType] ?? []
  }

  getFallbackChain(): readonly ModelProvider[] {
    return (
      (this.config?.routing?.fallbackChain as readonly ModelProvider[] | undefined) ?? [
        'openai',
        'anthropic',
        'ollama',
      ]
    )
  }

  isProviderEnabled(provider: ModelProvider): boolean {
    const p = this.config?.providers
    if (!p) return false
    const providerConfig = p[provider as keyof typeof p]
    if (providerConfig && typeof providerConfig === 'object' && 'enabled' in providerConfig) {
      return (providerConfig as { enabled?: boolean }).enabled ?? false
    }
    return false
  }

  getProviderApiKey(provider: ModelProvider, customName?: string): string | undefined {
    const p = this.config?.providers
    if (!p) return undefined

    // 如果指定了 customName，使用 customName 作为 key 查找
    if (customName) {
      const customProvider = p[customName]
      if (customProvider && typeof customProvider === 'object' && 'apiKey' in customProvider) {
        return (customProvider as { apiKey?: string }).apiKey
      }
      return undefined
    }

    const providerConfig = p[provider as keyof typeof p]
    if (providerConfig && typeof providerConfig === 'object' && 'apiKey' in providerConfig) {
      return (providerConfig as { apiKey?: string }).apiKey
    }
    return process.env[`${provider.toUpperCase()}_API_KEY`]
  }

  getProviderBaseUrl(provider: ModelProvider, customName?: string): string | undefined {
    const p = this.config?.providers
    if (!p) return undefined

    // 如果指定了 customName，使用 customName 作为 key 查找
    if (customName) {
      const customProvider = p[customName]
      if (customProvider && typeof customProvider === 'object') {
        if ('baseUrl' in customProvider) return (customProvider as { baseUrl?: string }).baseUrl
        if ('host' in customProvider) return (customProvider as { host?: string }).host
      }
      return undefined
    }

    const providerConfig = p[provider as keyof typeof p]
    if (providerConfig && typeof providerConfig === 'object') {
      if ('baseUrl' in providerConfig) return (providerConfig as { baseUrl?: string }).baseUrl
      if ('host' in providerConfig) return (providerConfig as { host?: string }).host
    }
    return undefined
  }

  getModels(provider: ModelProvider): readonly string[] {
    const p = this.config?.providers
    if (!p) return []
    const providerConfig = p[provider as keyof typeof p]
    if (providerConfig && typeof providerConfig === 'object' && 'models' in providerConfig) {
      const models = (providerConfig as { models?: (string | { id: string; alias: string })[] })
        .models
      if (Array.isArray(models)) {
        return models.map((m) => (typeof m === 'string' ? m : m.id))
      }
    }
    return []
  }

  getAllModels(): { provider: string; models: string[] }[] {
    const result: { provider: string; models: string[] }[] = []
    const providers = this.config?.providers
    if (!providers) return result

    for (const [name, config] of Object.entries(providers)) {
      if (config && typeof config === 'object' && 'models' in config) {
        const models = (
          (config as { models?: (string | { id: string; alias: string })[] }).models ?? []
        ).map((m) => (typeof m === 'string' ? m : m.id))
        if (models.length > 0) {
          result.push({ provider: name, models })
        }
      }
    }
    return result
  }

  // 获取自定义端点名称列表
  getCustomEndpointNames(): readonly string[] {
    const providers = this.config?.providers
    if (!providers) return []
    // 返回所有非标准 provider 的名称（custom endpoints）
    return Object.keys(providers).filter(
      (k) => !['openai', 'anthropic', 'google', 'deepseek', 'ollama', 'groq'].includes(k)
    )
  }

  // 获取自定义端点配置
  getCustomEndpoint(name: string) {
    const providers = this.config?.providers
    if (!providers) return null
    return providers[name] || null
  }

  // 解析模型别名
  resolveAlias(
    modelId: string
  ): { modelId: string; provider?: string; customName?: string } | null {
    const providers = this.config?.providers
    if (!providers) return null

    // 遍历所有 provider 的模型配置，查找别名
    for (const [providerName, config] of Object.entries(providers)) {
      if (config && typeof config === 'object' && 'models' in config) {
        const models = (config as { models?: (string | { id: string; alias: string })[] }).models
        if (Array.isArray(models)) {
          for (const m of models) {
            if (typeof m === 'object' && m.alias === modelId) {
              // 如果是自定义 provider（非标准），返回 customName
              const isCustom = ![
                'openai',
                'anthropic',
                'google',
                'deepseek',
                'ollama',
                'groq',
              ].includes(providerName)
              if (isCustom) {
                return { modelId: m.id, customName: providerName }
              }
              return { modelId: m.id, provider: providerName }
            }
          }
        }
      }
    }
    return null
  }

  async updateConfig(updates: Partial<AppConfig>): Promise<void> {
    this.config = { ...this.config!, ...updates }
    await saveConfig(this.config)
  }

  getSandboxConfig(): AppConfig['sandbox'] {
    return (
      this.config?.sandbox ?? {
        enabled: true,
        allowedPaths: [],
        blockedPaths: [],
        blockedCommands: [],
      }
    )
  }

  getKnowledgeConfig(): KnowledgeConfig | undefined {
    return this.config?.knowledge
  }

  getMcpConfig(): Record<string, McpServerConfig> {
    return this.config?.mcp ?? {}
  }
}

// Singleton
let configManagerInstance: ConfigManager | null = null

export function getConfigManager(): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager()
  }
  return configManagerInstance
}

export async function initializeConfig(): Promise<ConfigManager> {
  const manager = getConfigManager()
  await manager.initialize()
  return manager
}
