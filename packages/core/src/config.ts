import { z } from 'zod'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import YAML from 'yaml'
import type { ModelsConfig, RoutingStrategy, ModelProvider, TaskType } from './types.js'

// Configuration schema
const AppConfigSchema = z.object({
  dataDir: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFile: z.string().optional(),
  defaultModel: z.string().optional(),
  routingStrategy: z.enum(['quality', 'balanced', 'economy']).default('balanced'),
  maxHistoryMessages: z.number().int().positive().default(100),
  skillsDir: z.string().optional(),
  sandbox: z
    .object({
      enabled: z.boolean().default(true),
      allowedPaths: z.array(z.string()).default([]),
      blockedPaths: z.array(z.string()).default([]),
      blockedCommands: z.array(z.string()).default([]),
    })
    .default({}),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

// Default configuration
const DEFAULT_CONFIG: AppConfig = {
  logLevel: 'info',
  routingStrategy: 'balanced',
  maxHistoryMessages: 100,
  sandbox: {
    enabled: true,
    allowedPaths: [],
    blockedPaths: ['.ssh', '.env', 'credentials', '.git/config'],
    blockedCommands: ['rm -rf /', 'curl | bash', 'wget | bash', 'format', 'mkfs'],
  },
}

// Default models configuration
const DEFAULT_MODELS_CONFIG: ModelsConfig = {
  providers: {
    openai: {
      enabled: true,
      models: [
        { id: 'gpt-4o', provider: 'openai', priority: 1, costPer1k: 0.005 },
        { id: 'gpt-4o-mini', provider: 'openai', priority: 2, costPer1k: 0.00015 },
      ],
    },
    anthropic: {
      enabled: true,
      models: [
        { id: 'claude-sonnet-4-20250514', provider: 'anthropic', priority: 1 },
        { id: 'claude-haiku-3-5-20241022', provider: 'anthropic', priority: 2 },
      ],
    },
    google: {
      enabled: false,
      models: [],
    },
    deepseek: {
      enabled: false,
      baseUrl: 'https://api.deepseek.com/v1',
      models: [{ id: 'deepseek-chat', provider: 'deepseek', priority: 1 }],
    },
    ollama: {
      enabled: true,
      baseUrl: 'http://localhost:11434',
      models: [
        { id: 'llama3:8b', provider: 'ollama', priority: 1 },
        { id: 'qwen2:7b', provider: 'ollama', priority: 2 },
      ],
    },
    groq: {
      enabled: false,
      models: [],
    },
    custom: {
      enabled: false,
      models: [],
    },
  },
  routing: {
    strategy: 'balanced',
    fallbackChain: ['openai', 'anthropic', 'ollama'],
    taskMapping: {
      simple_qa: ['gpt-4o-mini', 'claude-haiku-3-5-20241022', 'ollama/llama3:8b'],
      code_generation: ['claude-sonnet-4-20250514', 'deepseek-chat', 'gpt-4o'],
      complex_reasoning: ['claude-opus-4-20250514', 'gpt-4o', 'o1'],
      file_operation: ['gpt-4o-mini', 'claude-haiku-3-5-20241022'],
      shell_command: ['gpt-4o-mini', 'ollama/llama3:8b'],
      web_operation: ['gpt-4o', 'claude-sonnet-4-20250514'],
      local_only: ['ollama/llama3:8b', 'ollama/qwen2:7b'],
    },
  },
}

export class ConfigManager {
  private config: AppConfig
  private modelsConfig: ModelsConfig
  private readonly configDir: string
  private readonly configPath: string
  private readonly modelsConfigPath: string

  constructor() {
    this.configDir = this.getConfigDir()
    this.configPath = path.join(this.configDir, 'config.yaml')
    this.modelsConfigPath = path.join(this.configDir, 'models.yaml')
    this.config = DEFAULT_CONFIG
    this.modelsConfig = DEFAULT_MODELS_CONFIG
  }

  private getConfigDir(): string {
    const homeDir = os.homedir()
    return path.join(homeDir, '.wqbot')
  }

  getDataDir(): string {
    return this.config.dataDir ?? path.join(this.configDir, 'data')
  }

  getSkillsDir(): string {
    return this.config.skillsDir ?? path.join(this.configDir, 'skills')
  }

  getLogFile(): string | undefined {
    return this.config.logFile
  }

  async initialize(): Promise<void> {
    await this.ensureConfigDir()
    await this.loadConfig()
    await this.loadModelsConfig()
  }

  private async ensureConfigDir(): Promise<void> {
    const dirs = [this.configDir, this.getDataDir(), this.getSkillsDir()]

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true })
      }
    }
  }

  private async loadConfig(): Promise<void> {
    if (fs.existsSync(this.configPath)) {
      const content = await fs.promises.readFile(this.configPath, 'utf-8')
      const parsed = YAML.parse(content)
      const validated = AppConfigSchema.safeParse(parsed)

      if (validated.success) {
        this.config = { ...DEFAULT_CONFIG, ...validated.data }
      }
    } else {
      await this.saveConfig()
    }
  }

  private async loadModelsConfig(): Promise<void> {
    if (fs.existsSync(this.modelsConfigPath)) {
      const content = await fs.promises.readFile(this.modelsConfigPath, 'utf-8')
      const parsed = YAML.parse(content)

      // Expand environment variables in API keys
      if (parsed?.providers) {
        for (const provider of Object.values(parsed.providers) as Array<{
          api_key?: string
          apiKey?: string
        }>) {
          if (provider.api_key) {
            provider.apiKey = this.expandEnvVar(provider.api_key)
            delete provider.api_key
          }
        }
      }

      this.modelsConfig = { ...DEFAULT_MODELS_CONFIG, ...parsed }
    } else {
      await this.saveModelsConfig()
    }
  }

  private expandEnvVar(value: string): string {
    const envVarPattern = /\$\{([^}]+)\}/g
    return value.replace(envVarPattern, (_, varName: string) => {
      return process.env[varName] ?? ''
    })
  }

  private async saveConfig(): Promise<void> {
    const content = YAML.stringify(this.config)
    await fs.promises.writeFile(this.configPath, content, 'utf-8')
  }

  private async saveModelsConfig(): Promise<void> {
    const content = YAML.stringify(this.modelsConfig)
    await fs.promises.writeFile(this.modelsConfigPath, content, 'utf-8')
  }

  getConfig(): Readonly<AppConfig> {
    return this.config
  }

  getModelsConfig(): Readonly<ModelsConfig> {
    return this.modelsConfig
  }

  getRoutingStrategy(): RoutingStrategy {
    return this.config.routingStrategy
  }

  getModelsForTask(taskType: TaskType): readonly string[] {
    return this.modelsConfig.routing.taskMapping[taskType] ?? []
  }

  getFallbackChain(): readonly ModelProvider[] {
    return this.modelsConfig.routing.fallbackChain
  }

  isProviderEnabled(provider: ModelProvider): boolean {
    return this.modelsConfig.providers[provider]?.enabled ?? false
  }

  getProviderApiKey(provider: ModelProvider): string | undefined {
    const providerConfig = this.modelsConfig.providers[provider]
    if (!providerConfig?.apiKey) {
      // Try environment variable fallback
      const envVarName = `${provider.toUpperCase()}_API_KEY`
      return process.env[envVarName]
    }
    return providerConfig.apiKey
  }

  getProviderBaseUrl(provider: ModelProvider): string | undefined {
    return this.modelsConfig.providers[provider]?.baseUrl
  }

  async updateConfig(updates: Partial<AppConfig>): Promise<void> {
    this.config = { ...this.config, ...updates }
    await this.saveConfig()
  }

  getSandboxConfig(): AppConfig['sandbox'] {
    return this.config.sandbox
  }
}

// Singleton instance
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
