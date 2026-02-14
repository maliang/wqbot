import type { FastifyInstance } from 'fastify'
import { getSettingsStore } from '@wqbot/storage'
import {
  setLocale,
  getLocale,
  loadApiConfig,
  saveApiConfig,
  isApiConfigured,
  getAvailableProviders,
  getThemeManager,
} from '@wqbot/core'
import type { Locale, Theme } from '@wqbot/core'
import type { Settings } from '@wqbot/storage'
import type { ApiResponse } from '../types.js'

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  const settingsStore = getSettingsStore()

  // 获取所有设置（包括 API 配置）
  fastify.get('/api/settings', async (_request, reply) => {
    const settings = settingsStore.getAll()
    const apiConfig = (await loadApiConfig()) as {
      providers: Record<string, Record<string, unknown>>
      defaultProvider: string
      defaultModel: string
    }
    const configured = await isApiConfigured()
    const providers = await getAvailableProviders()

    // 将 API 配置转换为扁平格式供前端使用
    const p = apiConfig.providers
    const response: ApiResponse<Record<string, unknown>> = {
      success: true,
      data: {
        ...settings,
        // API 配置
        openaiApiKey: (p.openai?.apiKey as string) || '',
        anthropicApiKey: (p.anthropic?.apiKey as string) || '',
        deepseekApiKey: (p.deepseek?.apiKey as string) || '',
        googleApiKey: (p.google?.apiKey as string) || '',
        groqApiKey: (p.groq?.apiKey as string) || '',
        ollamaHost: (p.ollama?.host as string) || '',
        // 默认模型
        defaultProvider: apiConfig.defaultProvider || '',
        defaultModel: apiConfig.defaultModel || '',
        // 状态
        isConfigured: configured,
        availableProviders: providers,
      },
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

      // API 配置相关字段
      const apiKeys = [
        'openaiApiKey',
        'anthropicApiKey',
        'deepseekApiKey',
        'googleApiKey',
        'groqApiKey',
        'ollamaHost',
        'defaultProvider',
        'defaultModel',
      ]

      // 加载现有配置
      const currentConfig = (await loadApiConfig()) as Record<string, Record<string, unknown>> & {
        defaultProvider?: string
        defaultModel?: string
      }

      // 更新 API 配置
      const updatedConfig: Record<string, unknown> = { ...currentConfig }
      const p = (updatedConfig.providers as Record<string, Record<string, unknown>>) || {}

      if (updates.openaiApiKey !== undefined) {
        p.openai = { ...p.openai, apiKey: updates.openaiApiKey }
      }
      if (updates.anthropicApiKey !== undefined) {
        p.anthropic = { ...p.anthropic, apiKey: updates.anthropicApiKey }
      }
      if (updates.deepseekApiKey !== undefined) {
        p.deepseek = { ...p.deepseek, apiKey: updates.deepseekApiKey }
      }
      if (updates.googleApiKey !== undefined) {
        p.google = { ...p.google, apiKey: updates.googleApiKey }
      }
      if (updates.groqApiKey !== undefined) {
        p.groq = { ...p.groq, apiKey: updates.groqApiKey }
      }
      if (updates.ollamaHost !== undefined) {
        p.ollama = { ...p.ollama, host: updates.ollamaHost }
      }
      if (updates.defaultProvider !== undefined) {
        updatedConfig.defaultProvider = updates.defaultProvider
      }
      if (updates.defaultModel !== undefined) {
        updatedConfig.defaultModel = updates.defaultModel
      }

      // 检查是否有 API 配置更新
      const hasApiUpdates = apiKeys.some(
        (key) => updates[key as keyof typeof updates] !== undefined
      )

      // 保存 API 配置
      if (hasApiUpdates) {
        await saveApiConfig(updatedConfig as Parameters<typeof saveApiConfig>[0])
      }

      // 处理其他设置
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined && !apiKeys.includes(key)) {
          settingsStore.set(key as keyof Settings, value as never)
        }
      }

      const response: ApiResponse = { success: true }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '更新失败',
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
      data: { key: request.params.key, value },
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
      const response: ApiResponse = { success: true }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '设置失败',
      }
      return reply.status(500).send(response)
    }
  })

  // 获取当前语言
  fastify.get('/api/settings/language', async (_request, reply) => {
    const locale = getLocale()
    const response: ApiResponse<{ language: string }> = {
      success: true,
      data: { language: locale },
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
      const response: ApiResponse = { success: true }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '设置语言失败',
      }
      return reply.status(500).send(response)
    }
  })

  // 重置所有设置
  fastify.post('/api/settings/reset', async (_request, reply) => {
    try {
      settingsStore.reset()
      const response: ApiResponse = { success: true }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '重置失败',
      }
      return reply.status(500).send(response)
    }
  })

  // ── 主题 API ──────────────────────────────────────────

  const themeManager = getThemeManager()

  // 获取所有主题
  fastify.get('/api/themes', async (_request, reply) => {
    const themes = themeManager.listThemes()
    const current = themeManager.getTheme()
    const response: ApiResponse<{ themes: readonly Theme[]; current: string }> = {
      success: true,
      data: { themes, current: current.name },
    }
    return reply.send(response)
  })

  // 切换主题
  fastify.put<{
    Body: { name: string }
  }>('/api/themes', async (request, reply) => {
    try {
      const { name } = request.body
      themeManager.setTheme(name)
      settingsStore.set('theme' as keyof Settings, name as never)
      const theme = themeManager.getTheme()
      const cssVars = themeManager.toCssVariables(theme)
      const response: ApiResponse<{ theme: Theme; cssVariables: Record<string, string> }> = {
        success: true,
        data: { theme, cssVariables: cssVars },
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '切换主题失败',
      }
      return reply.status(400).send(response)
    }
  })

  // 获取当前主题的 CSS 变量
  fastify.get('/api/themes/css-variables', async (_request, reply) => {
    const cssVars = themeManager.toCssVariables()
    const response: ApiResponse<Record<string, string>> = {
      success: true,
      data: cssVars,
    }
    return reply.send(response)
  })
}
