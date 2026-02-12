import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { z } from 'zod'
import yaml from 'yaml'
import { createModuleLogger } from './logger.js'

const logger = createModuleLogger('api-config')

// API 配置目录
const CONFIG_DIR = path.join(os.homedir(), '.wqbot')
const API_CONFIG_FILE = path.join(CONFIG_DIR, 'api-keys.yaml')

// API 配置 Schema
export const ApiConfigSchema = z.object({
  // 默认模型
  defaultModel: z.string().optional(),
  defaultProvider: z.string().optional(),

  // OpenAI
  openai: z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    models: z.array(z.string()).optional()
  }).optional(),

  // Anthropic
  anthropic: z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    models: z.array(z.string()).optional()
  }).optional(),

  // Google
  google: z.object({
    apiKey: z.string().optional(),
    models: z.array(z.string()).optional()
  }).optional(),

  // DeepSeek
  deepseek: z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    models: z.array(z.string()).optional()
  }).optional(),

  // Ollama (本地)
  ollama: z.object({
    host: z.string().optional(),
    models: z.array(z.string()).optional()
  }).optional(),

  // Groq
  groq: z.object({
    apiKey: z.string().optional(),
    models: z.array(z.string()).optional()
  }).optional(),

  // 自定义 OpenAI 兼容 API
  custom: z.array(z.object({
    name: z.string(),
    apiKey: z.string().optional(),
    baseUrl: z.string(),
    models: z.array(z.string()).optional()
  })).optional()
})

export type ApiConfig = z.infer<typeof ApiConfigSchema>

// 默认配置
const DEFAULT_CONFIG: ApiConfig = {
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o',
  openai: {
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  anthropic: {
    models: ['claude-sonnet-4-5-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
  },
  ollama: {
    host: 'http://localhost:11434',
    models: ['llama3', 'codellama', 'mistral']
  }
}

// 确保配置目录存在
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true })
  } catch {
    // 目录已存在
  }
}

// 加载 API 配置
export async function loadApiConfig(): Promise<ApiConfig> {
  await ensureConfigDir()

  try {
    const content = await fs.readFile(API_CONFIG_FILE, 'utf-8')
    const parsed = yaml.parse(content)
    const validated = ApiConfigSchema.parse(parsed)
    logger.debug('API 配置已加载')
    return { ...DEFAULT_CONFIG, ...validated }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.debug('API 配置文件不存在，使用默认配置')
      return DEFAULT_CONFIG
    }
    logger.error('加载 API 配置失败', error instanceof Error ? error : new Error(String(error)))
    return DEFAULT_CONFIG
  }
}

// 保存 API 配置
export async function saveApiConfig(config: ApiConfig): Promise<void> {
  await ensureConfigDir()

  const content = yaml.stringify(config, {
    indent: 2,
    lineWidth: 0
  })

  await fs.writeFile(API_CONFIG_FILE, content, 'utf-8')
  logger.info('API 配置已保存')
}

// 检查是否已配置 API
export async function isApiConfigured(): Promise<boolean> {
  const config = await loadApiConfig()

  // 检查是否有任何有效的 API Key
  const hasOpenAI = !!config.openai?.apiKey || !!process.env.OPENAI_API_KEY
  const hasAnthropic = !!config.anthropic?.apiKey || !!process.env.ANTHROPIC_API_KEY
  const hasGoogle = !!config.google?.apiKey || !!process.env.GOOGLE_API_KEY
  const hasDeepSeek = !!config.deepseek?.apiKey || !!process.env.DEEPSEEK_API_KEY
  const hasGroq = !!config.groq?.apiKey || !!process.env.GROQ_API_KEY
  const hasOllama = !!config.ollama?.host

  return hasOpenAI || hasAnthropic || hasGoogle || hasDeepSeek || hasGroq || hasOllama
}

// 获取配置文件路径
export function getApiConfigPath(): string {
  return API_CONFIG_FILE
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
  const currentConfig = await loadApiConfig()
  const updatedConfig = {
    ...currentConfig,
    [provider]: {
      ...(currentConfig as Record<string, unknown>)[provider] as Record<string, unknown>,
      ...config
    }
  }
  await saveApiConfig(updatedConfig)
}

// 设置默认模型
export async function setDefaultModel(provider: string, model: string): Promise<void> {
  const currentConfig = await loadApiConfig()
  await saveApiConfig({
    ...currentConfig,
    defaultProvider: provider,
    defaultModel: model
  })
}

// 获取可用的提供商列表
export async function getAvailableProviders(): Promise<string[]> {
  const config = await loadApiConfig()
  const providers: string[] = []

  if (config.openai?.apiKey || process.env.OPENAI_API_KEY) {
    providers.push('openai')
  }
  if (config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY) {
    providers.push('anthropic')
  }
  if (config.google?.apiKey || process.env.GOOGLE_API_KEY) {
    providers.push('google')
  }
  if (config.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY) {
    providers.push('deepseek')
  }
  if (config.groq?.apiKey || process.env.GROQ_API_KEY) {
    providers.push('groq')
  }
  if (config.ollama?.host) {
    providers.push('ollama')
  }

  return providers
}
