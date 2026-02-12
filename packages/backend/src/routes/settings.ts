import type { FastifyInstance } from 'fastify'
import { getSettingsStore } from '@wqbot/storage'
import {
  setLocale,
  getLocale,
  loadApiConfig,
  saveApiConfig,
  isApiConfigured,
  getAvailableProviders,
  setDefaultModel
} from '@wqbot/core'
import type { Locale, ApiConfig } from '@wqbot/core'
import type { ApiResponse, Settings } from '../types.js'

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  const settingsStore = getSettingsStore()

  // 获取所有设置（包括 API 配置）
  fastify.get('/api/settings', async (_request, reply) => {
    const settings = settingsStore.getAll()
    const apiConfig = await loadApiConfig()
    const configured = await isApiConfigured()
    const providers = await getAvailableProviders()

    // 将 API 配置转换为扁平格式供前端使用
    const response: ApiResponse<Record<string, unknown>> = {
      success: true,
      data: {
        ...settings,
        // API 配置
        openaiApiKey: apiConfig.openai?.apiKey || '',
        anthropicApiKey: apiConfig.anthropic?.apiKey || '',
        deepseekApiKey: apiConfig.deepseek?.apiKey || '',
        googleApiKey: apiConfig.google?.apiKey || '',
        groqApiKey: apiConfig.groq?.apiKey || '',
        ollamaHost: apiConfig.ollama?.host || '',
        // 默认模型
        defaultProvider: apiConfig.defaultProvider || '',
        defaultModel: apiConfig.defaultModel || '',
        // 状态
        isConfigured: configured,
        availableProviders: providers
      }
    }
    return reply.send(response)
  })

  // 更新设置（包括 API 配置）
  fastify.put<{
    Body: Partial<Settings> & {
      openaiApiKey?: string
      anthropicApiKey?: string
      deepseekApiKey?: string
      googleApiKey?: string
      groqApiKey?: string
      ollamaHost?: string
      defaultProvider?: string
      defaultModel?: string
    }
  }>('/api/settings', async (request, reply) => {
    try {
      const updates = request.body

      // 处理 API 配置更新
      const apiConfigUpdates: Partial<ApiConfig> = {}
      const apiKeys = [
        'openaiApiKey',
        'anthropicApiKey',
        'deepseekApiKey',
        'googleApiKey',
        'groqApiKey',
        'ollamaHost',
        'defaultProvider',
        'defaultModel'
      ]

      // 加载现有配置
      const currentConfig = await loadApiConfig()

      // 更新 API 配置
      if (updates.openaiApiKey !== undefined) {
        apiConfigUpdates.openai = {
          ...currentConfig.openai,
          apiKey: updates.openaiApiKey
        }
      }
      if (updates.anthropicApiKey !== undefined) {
        apiConfigUpdates.anthropic = {
          ...currentConfig.anthropic,
          apiKey: updates.anthropicApiKey
        }
      }
      if (updates.deepseekApiKey !== undefined) {
        apiConfigUpdates.deepseek = {
          ...currentConfig.deepseek,
          apiKey: updates.deepseekApiKey
        }
      }
      if (updates.googleApiKey !== undefined) {
        apiConfigUpdates.google = {
          ...currentConfig.google,
          apiKey: updates.googleApiKey
        }
      }
      if (updates.groqApiKey !== undefined) {
        apiConfigUpdates.groq = {
          ...currentConfig.groq,
          apiKey: updates.groqApiKey
        }
      }
      if (updates.ollamaHost !== undefined) {
        apiConfigUpdates.ollama = {
          ...currentConfig.ollama,
          host: updates.ollamaHost
        }
      }
      if (updates.defaultProvider !== undefined) {
        apiConfigUpdates.defaultProvider = updates.defaultProvider
      }
      if (updates.defaultModel !== undefined) {
        apiConfigUpdates.defaultModel = updates.defaultModel
      }

      // 保存 API 配置
      if (Object.keys(apiConfigUpdates).length > 0) {
        await saveApiConfig({
          ...currentConfig,
          ...apiConfigUpdates
        })
      }

      // 处理其他设置
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined && !apiKeys.includes(key)) {
          settingsStore.set(key as keyof Settings, value as never)
        }
      }

      const response: ApiResponse = {
        success: true
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '更新失败'
      }
      return reply.status(500).send(response)
    }
  })

  // 获取单个设置
  fastify.get<{
    Params: { key: string }
  }>('/api/settings/:key', async (request, reply) => {
    const value = settingsStore.get(request.params.key as keyof Settings)

    const response: ApiResponse<{ key: string; value: unknown }> = {
      success: true,
      data: {
        key: request.params.key,
        value
      }
    }
    return reply.send(response)
  })

  // 设置单个值
  fastify.put<{
    Params: { key: string }
    Body: { value: unknown }
  }>('/api/settings/:key', async (request, reply) => {
    try {
      settingsStore.set(request.params.key as keyof Settings, request.body.value as never)

      const response: ApiResponse = {
        success: true
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '设置失败'
      }
      return reply.status(500).send(response)
    }
  })

  // 获取当前语言
  fastify.get('/api/settings/language', async (_request, reply) => {
    const locale = getLocale()

    const response: ApiResponse<{ language: string }> = {
      success: true,
      data: { language: locale }
    }
    return reply.send(response)
  })

  // 设置语言
  fastify.put<{
    Body: { language: string }
  }>('/api/settings/language', async (request, reply) => {
    try {
      const { language } = request.body
      setLocale(language as Locale)
      settingsStore.set('language', language)

      const response: ApiResponse = {
        success: true
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '设置语言失败'
      }
      return reply.status(500).send(response)
    }
  })

  // 重置所有设置
  fastify.post('/api/settings/reset', async (_request, reply) => {
    try {
      settingsStore.reset()

      const response: ApiResponse = {
        success: true
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '重置失败'
      }
      return reply.status(500).send(response)
    }
  })
}
