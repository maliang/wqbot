export type Locale = 'en' | 'zh-CN'

export interface TranslationData {
  [key: string]: string | TranslationData
}

const translations: Map<Locale, TranslationData> = new Map()

let currentLocale: Locale = 'en'

// Built-in translations
const builtinTranslations: Record<Locale, TranslationData> = {
  en: {
    common: {
      yes: 'Yes',
      no: 'No',
      cancel: 'Cancel',
      confirm: 'Confirm',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      loading: 'Loading...',
      saving: 'Saving...',
      done: 'Done',
      failed: 'Failed',
      unknown: 'Unknown',
      none: 'None',
      all: 'All',
      back: 'Back',
      next: 'Next',
      exit: 'Exit',
      help: 'Help',
    },
    cli: {
      welcome: 'WQBot - Intelligent AI Butler',
      thinking: 'Thinking...',
      goodbye: 'Goodbye!',
      conversationId: 'Conversation',
      exitHint: 'Type "exit" or "quit" to end the session',
      helpHint: 'Type "/help" for available commands',
      you: 'You',
      assistant: 'Assistant',
      noConversations: 'No conversations found',
      noSkills: 'No skills installed',
      skillNotFound: 'Skill not found',
      conversationNotFound: 'Conversation not found',
      searchNoResults: 'No results found for',
      commands: {
        help: 'Show this help message',
        clear: 'Clear the screen',
        history: 'Show conversation history',
        new: 'Start a new conversation',
        skills: 'List available skills',
        export: 'Export conversation (json/md)',
        info: 'Show current session info',
      },
    },
    chat: {
      startNew: 'Started new conversation',
      messages: 'Messages',
      lastUpdated: 'Last updated',
      created: 'Created',
      showingLast: 'Showing last {count} of {total} messages',
    },
    skill: {
      installed: 'Installed Skills',
      available: 'Available skills',
      search: 'Searching...',
      searchResults: 'Found {count} skills',
      installing: 'Installing {name}...',
      installSuccess: 'Successfully installed',
      installFailed: 'Installation failed',
      uninstalling: 'Uninstalling {name}...',
      uninstallSuccess: 'Successfully uninstalled',
      uninstallFailed: 'Uninstallation failed',
      updating: 'Updating {name}...',
      updateSuccess: 'Successfully updated',
      updateFailed: 'Update failed',
      creating: 'Creating skill: {name}...',
      createSuccess: 'Created skill at',
      createFailed: 'Creation failed',
      nextSteps: 'Next steps',
      permissions: 'Permissions',
      triggers: 'Triggers',
      platforms: 'Platforms',
      noneRequired: 'None required',
      searchHint: 'Use "wqbot skill search <query>" to find skills',
    },
    config: {
      title: 'WQBot Configuration',
      appConfig: 'App Config',
      userSettings: 'User Settings',
      directories: 'Directories',
      noCustomSettings: 'No custom settings',
      logLevel: 'Log Level',
      routingStrategy: 'Routing Strategy',
      maxHistoryMessages: 'Max History Messages',
      sandboxEnabled: 'Sandbox Enabled',
      dataDir: 'Data',
      skillsDir: 'Skills',
      notSet: 'is not set',
      set: 'Set {key} = {value}',
      resetConfirm: 'This will reset all settings to defaults.',
      resetSuccess: 'Settings reset to defaults',
      useYesToConfirm: 'Use --yes to confirm',
      importSuccess: 'Configuration imported successfully',
      importFailed: 'Import failed',
      exportSuccess: 'Exported to',
    },
    models: {
      title: 'Model Providers',
      available: 'Available',
      enabledNotConnected: 'Enabled but not connected',
      disabled: 'Disabled',
      routing: 'Routing',
      strategy: 'Strategy',
      fallbackChain: 'Fallback Chain',
    },
    sandbox: {
      title: 'Sandbox Configuration',
      status: 'Status',
      enabled: 'Enabled',
      allowedPaths: 'Allowed Paths',
      blockedPatterns: 'Blocked Patterns',
    },
    history: {
      title: 'Recent Conversations',
      showing: 'Showing {count} conversations',
      continueHint: 'Use "wqbot chat -c <id>" to continue a conversation',
      deleteConfirm: 'This will delete "{title}" and all its messages.',
      deleteSuccess: 'Deleted conversation',
      clearConfirm: 'This will delete ALL conversation history.',
      clearSuccess: 'Deleted {count} conversations',
      stats: 'Conversation Statistics',
      totalConversations: 'Total Conversations',
      totalMessages: 'Total Messages',
      oldest: 'Oldest',
      mostRecent: 'Most Recent',
      avgMessages: 'Average Messages/Conversation',
    },
  },
  'zh-CN': {
    common: {
      yes: '是',
      no: '否',
      cancel: '取消',
      confirm: '确认',
      error: '错误',
      success: '成功',
      warning: '警告',
      loading: '加载中...',
      saving: '保存中...',
      done: '完成',
      failed: '失败',
      unknown: '未知',
      none: '无',
      all: '全部',
      back: '返回',
      next: '下一步',
      exit: '退出',
      help: '帮助',
    },
    cli: {
      welcome: 'WQBot - 智能AI管家',
      thinking: '思考中...',
      goodbye: '再见！',
      conversationId: '对话',
      exitHint: '输入 "exit" 或 "quit" 结束会话',
      helpHint: '输入 "/help" 查看可用命令',
      you: '你',
      assistant: '助手',
      noConversations: '没有找到对话',
      noSkills: '没有安装技能',
      skillNotFound: '技能未找到',
      conversationNotFound: '对话未找到',
      searchNoResults: '没有找到相关结果',
      commands: {
        help: '显示帮助信息',
        clear: '清屏',
        history: '显示对话历史',
        new: '开始新对话',
        skills: '列出可用技能',
        export: '导出对话 (json/md)',
        info: '显示当前会话信息',
      },
    },
    chat: {
      startNew: '已开始新对话',
      messages: '消息',
      lastUpdated: '最后更新',
      created: '创建时间',
      showingLast: '显示最近 {count} 条，共 {total} 条消息',
    },
    skill: {
      installed: '已安装的技能',
      available: '可用技能',
      search: '搜索中...',
      searchResults: '找到 {count} 个技能',
      installing: '正在安装 {name}...',
      installSuccess: '安装成功',
      installFailed: '安装失败',
      uninstalling: '正在卸载 {name}...',
      uninstallSuccess: '卸载成功',
      uninstallFailed: '卸载失败',
      updating: '正在更新 {name}...',
      updateSuccess: '更新成功',
      updateFailed: '更新失败',
      creating: '正在创建技能: {name}...',
      createSuccess: '技能已创建于',
      createFailed: '创建失败',
      nextSteps: '下一步',
      permissions: '权限',
      triggers: '触发器',
      platforms: '平台',
      noneRequired: '无需权限',
      searchHint: '使用 "wqbot skill search <关键词>" 搜索技能',
    },
    config: {
      title: 'WQBot 配置',
      appConfig: '应用配置',
      userSettings: '用户设置',
      directories: '目录',
      noCustomSettings: '没有自定义设置',
      logLevel: '日志级别',
      routingStrategy: '路由策略',
      maxHistoryMessages: '最大历史消息数',
      sandboxEnabled: '沙箱已启用',
      dataDir: '数据目录',
      skillsDir: '技能目录',
      notSet: '未设置',
      set: '已设置 {key} = {value}',
      resetConfirm: '这将重置所有设置为默认值。',
      resetSuccess: '设置已重置为默认值',
      useYesToConfirm: '使用 --yes 确认',
      importSuccess: '配置导入成功',
      importFailed: '导入失败',
      exportSuccess: '已导出到',
    },
    models: {
      title: '模型提供者',
      available: '可用',
      enabledNotConnected: '已启用但未连接',
      disabled: '已禁用',
      routing: '路由',
      strategy: '策略',
      fallbackChain: '备选链',
    },
    sandbox: {
      title: '沙箱配置',
      status: '状态',
      enabled: '已启用',
      allowedPaths: '允许的路径',
      blockedPatterns: '阻止的模式',
    },
    history: {
      title: '最近的对话',
      showing: '显示 {count} 个对话',
      continueHint: '使用 "wqbot chat -c <id>" 继续对话',
      deleteConfirm: '这将删除 "{title}" 及其所有消息。',
      deleteSuccess: '已删除对话',
      clearConfirm: '这将删除所有对话历史。',
      clearSuccess: '已删除 {count} 个对话',
      stats: '对话统计',
      totalConversations: '对话总数',
      totalMessages: '消息总数',
      oldest: '最早',
      mostRecent: '最近',
      avgMessages: '平均消息数/对话',
    },
  },
}

/**
 * Initialize translations with built-in data
 */
export function initializeI18n(): void {
  for (const [locale, data] of Object.entries(builtinTranslations)) {
    translations.set(locale as Locale, data)
  }

  // Detect system locale
  const systemLocale = detectSystemLocale()
  if (translations.has(systemLocale)) {
    currentLocale = systemLocale
  }
}

/**
 * Detect system locale
 */
function detectSystemLocale(): Locale {
  // Check environment variables
  const envLocale = process.env['LANG'] || process.env['LC_ALL'] || process.env['LC_MESSAGES'] || ''

  if (envLocale.startsWith('zh')) {
    return 'zh-CN'
  }

  // Check Windows locale
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('node:child_process')
      const output = execSync('powershell -NoProfile -NonInteractive -Command "[System.Globalization.CultureInfo]::CurrentCulture.Name"', {
        encoding: 'utf-8',
      }).trim()
      if (output.startsWith('zh')) {
        return 'zh-CN'
      }
    } catch {
      // Ignore errors
    }
  }

  return 'en'
}

/**
 * Get current locale
 */
export function getLocale(): Locale {
  return currentLocale
}

/**
 * Set current locale
 */
export function setLocale(locale: Locale): void {
  if (translations.has(locale)) {
    currentLocale = locale
  } else {
    throw new Error(`Unsupported locale: ${locale}`)
  }
}

/**
 * Get available locales
 */
export function getAvailableLocales(): readonly Locale[] {
  return [...translations.keys()]
}

/**
 * Translate a key with optional interpolation
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const keys = key.split('.')
  let value: TranslationData | string | undefined = translations.get(currentLocale)

  for (const k of keys) {
    if (value === undefined || typeof value === 'string') {
      break
    }
    value = value[k]
  }

  // Fallback to English if not found
  if (value === undefined || typeof value !== 'string') {
    value = translations.get('en')
    for (const k of keys) {
      if (value === undefined || typeof value === 'string') {
        break
      }
      value = value[k]
    }
  }

  // Return key if still not found
  if (value === undefined || typeof value !== 'string') {
    return key
  }

  // Interpolate parameters
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue))
    }
  }

  return value
}

/**
 * Get locale display name
 */
export function getLocaleDisplayName(locale: Locale): string {
  const names: Record<Locale, string> = {
    en: 'English',
    'zh-CN': '简体中文',
  }
  return names[locale] ?? locale
}

// Initialize on module load
initializeI18n()
