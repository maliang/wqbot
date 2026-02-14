import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import type { LanguageModelV1 } from 'ai'
import { getProviderApiKey, getProviderBaseUrl, type ModelProvider } from '@wqbot/core'

// Provider SDK 工厂
type SDKFactory = (opts: { apiKey?: string; baseURL?: string }) => {
  languageModel: (id: string) => LanguageModelV1
}

const PROVIDER_FACTORIES: Record<string, SDKFactory> = {
  openai: createOpenAI as unknown as SDKFactory,
  anthropic: createAnthropic as unknown as SDKFactory,
  google: createGoogleGenerativeAI as unknown as SDKFactory,
  groq: createGroq as unknown as SDKFactory,
  deepseek: ((opts: { apiKey?: string; baseURL?: string }) =>
    createOpenAI({
      ...opts,
      baseURL: opts.baseURL ?? 'https://api.deepseek.com/v1',
    })) as unknown as SDKFactory,
  ollama: ((opts: { apiKey?: string; baseURL?: string }) =>
    createOpenAI({
      baseURL: opts.baseURL ?? 'http://localhost:11434/v1',
      apiKey: 'ollama', // Ollama 不需要 key 但 SDK 要求非空
    })) as unknown as SDKFactory,
  custom: ((opts: { apiKey?: string; baseURL?: string }) =>
    createOpenAI({
      apiKey: opts.apiKey ?? '',
      baseURL: opts.baseURL ?? 'http://localhost:8080/v1',
    })) as unknown as SDKFactory,
}

// SDK 实例缓存
const sdkCache = new Map<string, ReturnType<SDKFactory>>()

/**
 * 获取 Provider 的 SDK 实例（带缓存）
 */
export async function getSDK(
  provider: ModelProvider,
  customName?: string
): Promise<ReturnType<SDKFactory>> {
  const cacheKey = customName ? `${provider}:${customName}` : provider
  const cached = sdkCache.get(cacheKey)
  if (cached) return cached

  const factory = PROVIDER_FACTORIES[provider]
  if (!factory) {
    throw new Error(`不支持的 provider: ${provider}`)
  }

  const apiKey = await getProviderApiKey(provider, customName)
  const baseURL = await getProviderBaseUrl(provider, customName)

  const opts: { apiKey?: string; baseURL?: string } = {}
  if (apiKey) opts.apiKey = apiKey
  if (baseURL) opts.baseURL = baseURL

  const sdk = factory(opts)
  sdkCache.set(cacheKey, sdk)
  return sdk
}

/**
 * 获取 AI SDK LanguageModel 实例
 */
export async function getLanguageModel(
  provider: ModelProvider,
  modelId: string,
  customName?: string
): Promise<LanguageModelV1> {
  // 处理 "ollama/llama3:8b" 或 "openrouter/gpt-4o" 格式，提取实际模型 ID
  const actualModelId = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId

  const sdk = await getSDK(provider, customName)
  return sdk.languageModel(actualModelId)
}

/**
 * 清除 SDK 缓存（用于配置变更后重新初始化）
 */
export function clearSDKCache(): void {
  sdkCache.clear()
}
