import { promises as fs, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { z } from 'zod'
import yaml from 'yaml'
import { createModuleLogger } from './logger.js'

const logger = createModuleLogger('config')

// 配置目录
const CONFIG_DIR = path.join(os.homedir(), '.wqbot')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.yaml')

// ============================================================================
// 统一配置 Schema（合并 api-keys.yaml + config.yaml + models.yaml）
// ============================================================================

// 模型条目：字符串或 { id, alias } 对象
// - "gpt-4o" = { id: "gpt-4o", alias: "gpt-4o" }
// - { id: "gpt-4o", alias: "gpt4" }
const ModelEntrySchema = z.union([
  z.string(),
  z.object({
    id: z.string(),
    alias: z.string(),
  }),
])

// 路由任务映射
const TaskMappingSchema = z.record(z.array(z.string()))

// 路由配置
const RoutingSchema = z.object({
  strategy: z.enum(['quality', 'balanced', 'economy']).default('balanced'),
  fallbackChain: z.array(z.string()).default(['openai', 'anthropic', 'ollama']),
  taskMapping: TaskMappingSchema,
})

// MCP 服务器配置
const McpServerSchema = z.object({
  type: z.enum(['local', 'remote']).default('local'),
  command: z.array(z.string()).optional(),
  url: z.string().optional(),
  environment: z.record(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
  timeout: z.number().default(30000),
})

// 知识库 Embedding 配置
const KnowledgeEmbeddingSchema = z.object({
  provider: z.string(),
  model: z.string(),
  customName: z.string().optional(),
})

// 知识库集合配置
const KnowledgeCollectionSchema = z.object({
  name: z.string(),
  dirs: z.array(z.string()),
})

// 知识库配置
const KnowledgeConfigSchema = z.object({
  enabled: z.boolean().default(true), // 默认开启
  chunkSize: z.number().int().positive().default(1500),
  chunkOverlap: z.number().int().min(0).default(200),
  embedding: KnowledgeEmbeddingSchema.optional(),
  collections: z.array(KnowledgeCollectionSchema).optional(),
})

// 沙箱配置
const SandboxSchema = z.object({
  enabled: z.boolean().default(true),
  allowedPaths: z.array(z.string()).default([]),
  blockedPaths: z.array(z.string()).default([]),
  blockedCommands: z.array(z.string()).default([]),
})

// ===== 统一配置 Schema =====
export const ConfigSchema = z.object({
  // 默认模型
  defaultProvider: z.string().default('openai'),
  defaultModel: z.string().default('gpt-4o'),

  // Providers（合并密钥和模型）
  // 每个 provider: { apiKey?, baseUrl?, host?, models?: (string | { id, alias })[] }
  providers: z
    .record(
      z.object({
        enabled: z.boolean().default(true),
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        host: z.string().optional(),
        models: z.array(ModelEntrySchema).optional(),
      })
    )
    .default({}),

  // 路由配置
  routing: RoutingSchema.default({
    strategy: 'balanced',
    fallbackChain: ['openai', 'anthropic', 'ollama'],
    taskMapping: {},
  }),

  // 应用配置
  dataDir: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFile: z.string().optional(),
  maxHistoryMessages: z.number().int().positive().default(100),
  skillsDir: z.string().optional(),
  theme: z.string().optional(),
  mcp: z.record(z.string(), McpServerSchema).optional(),
  knowledge: KnowledgeConfigSchema.optional(),
  sandbox: SandboxSchema.default({
    enabled: true,
    allowedPaths: [],
    blockedPaths: [],
    blockedCommands: [],
  }),
})

export type AppConfig = z.infer<typeof ConfigSchema>

// 默认路由配置
const DEFAULT_ROUTING: z.infer<typeof RoutingSchema> = {
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
}

// 默认配置
const DEFAULT_CONFIG: AppConfig = {
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o',
  providers: {
    openai: {
      enabled: true,
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o3', 'o3-mini'],
    },
    anthropic: {
      enabled: true,
      models: [
        'claude-sonnet-4-20250514',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-opus-4-20250514',
      ],
    },
    google: {
      enabled: false,
      baseUrl: 'https://generativelanguage.googleapis.com',
      models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    },
    deepseek: {
      enabled: false,
      baseUrl: 'https://api.deepseek.com/v1',
      models: ['deepseek-chat'],
    },
    ollama: {
      enabled: true,
      host: 'http://localhost:11434',
      models: ['llama3', 'llama3:8b', 'qwen2:7b', 'codellama', 'mistral'],
    },
    groq: {
      enabled: false,
      models: ['llama3-70b-8192', 'mixtral-8x7b-32768'],
    },
  },
  routing: DEFAULT_ROUTING,
  logLevel: 'info',
  maxHistoryMessages: 100,
  sandbox: {
    enabled: true,
    allowedPaths: [],
    blockedPaths: ['.ssh', '.env', 'credentials', '.git/config'],
    blockedCommands: ['rm -rf /', 'curl | bash', 'wget | bash', 'format', 'mkfs'],
  },
}

// ===== 导出子类型（供外部使用）=====
export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>
export type McpServerConfig = z.infer<typeof McpServerSchema>

// 确保配置目录存在
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true })
  } catch {
    // 目录已存在
  }
}

// 变量替换：支持 {env:VAR}、{file:path}、${VAR}
export function expandVariables(value: string): string {
  // {env:VAR_NAME}
  value = value.replace(/\{env:([^}]+)\}/g, (_, varName: string) => {
    return process.env[varName] ?? ''
  })

  // {file:path} — 读取文件内容
  value = value.replace(/\{file:([^}]+)\}/g, (_, filePath: string) => {
    let resolved = filePath.trim()
    if (resolved.startsWith('~/')) {
      resolved = path.join(os.homedir(), resolved.slice(2))
    }
    try {
      return readFileSync(resolved, 'utf-8').trim()
    } catch {
      return ''
    }
  })

  // ${VAR_NAME} — 兼容语法
  value = value.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
    return process.env[varName] ?? ''
  })

  return value
}

// 加载配置
export async function loadConfig(): Promise<AppConfig> {
  await ensureConfigDir()

  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8')
    const content = expandVariables(raw)
    const parsed = yaml.parse(content)
    const validated = ConfigSchema.parse(parsed)
    logger.debug('配置已加载')
    return { ...(DEFAULT_CONFIG as AppConfig), ...validated }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('配置文件不存在，使用默认配置')
      return DEFAULT_CONFIG as AppConfig
    }
    logger.error('加载配置失败', error instanceof Error ? error : new Error(String(error)))
    return DEFAULT_CONFIG as AppConfig
  }
}

// 保存配置
export async function saveConfig(config: AppConfig): Promise<void> {
  await ensureConfigDir()

  const content = yaml.stringify(config, {
    indent: 2,
    lineWidth: 0,
  })

  await fs.writeFile(CONFIG_FILE, content, 'utf-8')
  logger.info('配置已保存')
}

// 检查是否已配置 API
export async function isApiConfigured(): Promise<boolean> {
  const config = await loadConfig()

  const p = config.providers
  const hasOpenAI = !!p.openai?.apiKey || !!process.env.OPENAI_API_KEY
  const hasAnthropic = !!p.anthropic?.apiKey || !!process.env.ANTHROPIC_API_KEY
  const hasGoogle = !!p.google?.apiKey || !!process.env.GOOGLE_API_KEY
  const hasDeepSeek = !!p.deepseek?.apiKey || !!process.env.DEEPSEEK_API_KEY
  const hasGroq = !!p.groq?.apiKey || !!process.env.GROQ_API_KEY
  const hasOllama = !!p.ollama?.host

  return hasOpenAI || hasAnthropic || hasGoogle || hasDeepSeek || hasGroq || hasOllama
}

// 获取配置文件路径
export function getConfigPath(): string {
  return CONFIG_FILE
}

// 获取配置目录路径
export function getConfigDir(): string {
  return CONFIG_DIR
}

// 更新单个提供商配置
export async function updateProviderConfig(
  provider: string,
  config: Record<string, unknown>
): Promise<void> {
  const currentConfig = await loadConfig()
  const updatedConfig = {
    ...currentConfig,
    providers: {
      ...currentConfig.providers,
      [provider]: {
        ...((currentConfig.providers as Record<string, unknown>)[provider] as Record<
          string,
          unknown
        >),
        ...config,
      },
    },
  }
  await saveConfig(updatedConfig as AppConfig)
}

// 设置默认模型
export async function setDefaultModel(provider: string, model: string): Promise<void> {
  const currentConfig = await loadConfig()
  await saveConfig({
    ...currentConfig,
    defaultProvider: provider,
    defaultModel: model,
  })
}

// 获取可用的提供商列表
export async function getAvailableProviders(): Promise<string[]> {
  const config = await loadConfig()
  const providers: string[] = []
  const p = config.providers

  if (p.openai?.apiKey || process.env.OPENAI_API_KEY) {
    providers.push('openai')
  }
  if (p.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY) {
    providers.push('anthropic')
  }
  if (p.google?.apiKey || process.env.GOOGLE_API_KEY) {
    providers.push('google')
  }
  if (p.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY) {
    providers.push('deepseek')
  }
  if (p.groq?.apiKey || process.env.GROQ_API_KEY) {
    providers.push('groq')
  }
  if (p.ollama?.host) {
    providers.push('ollama')
  }

  return providers
}

// 获取可用提供商列表（兼容函数）
export async function getAvailableProvidersList(): Promise<string[]> {
  return getAvailableProviders()
}

// 获取 Provider API Key（兼容函数）
export async function getProviderApiKey(
  provider: string,
  customName?: string
): Promise<string | undefined> {
  const config = await loadConfig()
  const p = config.providers

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

// 获取 Provider Base URL（兼容函数）
export async function getProviderBaseUrl(
  provider: string,
  customName?: string
): Promise<string | undefined> {
  const config = await loadConfig()
  const p = config.providers

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
