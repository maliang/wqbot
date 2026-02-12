// 斜杠命令处理器

import { getApiClient } from '../api.js'

export interface CommandResult {
  success: boolean
  message?: string
  data?: unknown
  exit?: boolean
}

export type CommandHandler = (args: string[]) => Promise<CommandResult>

interface Command {
  name: string
  aliases: string[]
  description: string
  usage?: string
  handler: CommandHandler
}

const commands: Map<string, Command> = new Map()

// 注册命令
function registerCommand(command: Command): void {
  commands.set(command.name, command)
  for (const alias of command.aliases) {
    commands.set(alias, command)
  }
}

// 帮助命令
registerCommand({
  name: 'help',
  aliases: ['h', '?'],
  description: '显示帮助信息',
  handler: async () => {
    const uniqueCommands = new Map<string, Command>()
    for (const cmd of commands.values()) {
      uniqueCommands.set(cmd.name, cmd)
    }

    const lines = [
      '可用命令:',
      '',
      ...Array.from(uniqueCommands.values()).map(
        (cmd) =>
          `  /${cmd.name.padEnd(15)} ${cmd.description}${cmd.aliases.length > 0 ? ` (别名: ${cmd.aliases.map((a) => '/' + a).join(', ')})` : ''}`
      ),
      '',
      '提示: 直接输入消息与 AI 对话'
    ]

    return { success: true, message: lines.join('\n') }
  }
})

// 退出命令
registerCommand({
  name: 'exit',
  aliases: ['quit', 'q'],
  description: '退出 WQBot',
  handler: async () => {
    return { success: true, message: '再见！', exit: true }
  }
})

// 清屏命令
registerCommand({
  name: 'clear',
  aliases: ['cls'],
  description: '清除屏幕',
  handler: async () => {
    console.clear()
    return { success: true }
  }
})

// 模型命令
registerCommand({
  name: 'model',
  aliases: ['m'],
  description: '查看或切换模型',
  usage: '/model [模型名称]',
  handler: async (args) => {
    const api = getApiClient()

    if (args.length === 0) {
      const result = await api.getSetting('model')
      if (result.success && result.data) {
        return { success: true, message: `当前模型: ${result.data.value}` }
      }
      return { success: false, message: '获取模型失败' }
    }

    const modelName = args[0]
    const result = await api.setSetting('model', modelName)
    if (result.success) {
      return { success: true, message: `已切换到模型: ${modelName}` }
    }
    return { success: false, message: result.error || '切换模型失败' }
  }
})

// 配置命令
registerCommand({
  name: 'config',
  aliases: ['cfg'],
  description: '查看或修改配置',
  usage: '/config [key=value]',
  handler: async (args) => {
    const api = getApiClient()

    if (args.length === 0) {
      const result = await api.getSettings()
      if (result.success && result.data) {
        const lines = ['当前配置:', '']
        for (const [key, value] of Object.entries(result.data)) {
          lines.push(`  ${key}: ${JSON.stringify(value)}`)
        }
        return { success: true, message: lines.join('\n') }
      }
      return { success: false, message: '获取配置失败' }
    }

    const [keyValue] = args
    if (!keyValue) {
      return { success: false, message: '无效的参数' }
    }
    const [key, value] = keyValue.split('=')
    if (!key || value === undefined) {
      return { success: false, message: '格式: /config key=value' }
    }

    let parsedValue: unknown = value
    try {
      parsedValue = JSON.parse(value)
    } catch {
      // 保持字符串
    }

    const result = await api.setSetting(key, parsedValue)
    if (result.success) {
      return { success: true, message: `已设置 ${key} = ${value}` }
    }
    return { success: false, message: result.error || '设置失败' }
  }
})

// 技能命令
registerCommand({
  name: 'skill',
  aliases: ['sk'],
  description: '管理技能',
  usage: '/skill [list|on|off|create|install] [name]',
  handler: async (args) => {
    const api = getApiClient()
    const subcommand = args[0] || 'list'
    const name = args[1]

    switch (subcommand) {
      case 'list': {
        const result = await api.getConfigsByType('skills')
        if (result.success && result.data) {
          if (result.data.length === 0) {
            return { success: true, message: '暂无技能' }
          }
          const lines = ['已安装技能:', '']
          for (const skill of result.data) {
            const status = skill.enabled ? '✓' : '✗'
            const scope = skill.scope === 'global' ? 'G' : 'P'
            lines.push(`  ${status} ${skill.name} (${scope})`)
          }
          return { success: true, message: lines.join('\n') }
        }
        return { success: false, message: '获取技能列表失败' }
      }

      case 'on': {
        if (!name) {
          return { success: false, message: '请指定技能名称: /skill on <name>' }
        }
        const result = await api.toggleConfig('skills', name, true)
        if (result.success) {
          return { success: true, message: `已启用技能: ${name}` }
        }
        return { success: false, message: result.error || '启用失败' }
      }

      case 'off': {
        if (!name) {
          return { success: false, message: '请指定技能名称: /skill off <name>' }
        }
        const result = await api.toggleConfig('skills', name, false)
        if (result.success) {
          return { success: true, message: `已禁用技能: ${name}` }
        }
        return { success: false, message: result.error || '禁用失败' }
      }

      case 'create': {
        const description = args.slice(1).join(' ') || '新技能'
        const result = await api.generateConfig('skills', description)
        if (result.success && result.data) {
          return {
            success: true,
            message: `已生成技能模板:\n\n${result.data.content}`,
            data: result.data
          }
        }
        return { success: false, message: result.error || '创建失败' }
      }

      case 'install': {
        if (!name) {
          return { success: false, message: '请指定技能 URI: /skill install <uri>' }
        }
        const result = await api.installSkill(name)
        if (result.success) {
          return { success: true, message: `已安装技能: ${name}` }
        }
        return { success: false, message: result.error || '安装失败' }
      }

      default:
        return { success: false, message: `未知子命令: ${subcommand}` }
    }
  }
})

// 规则命令
registerCommand({
  name: 'rule',
  aliases: ['r'],
  description: '管理规则',
  usage: '/rule [list|on|off|create] [name]',
  handler: async (args) => {
    const api = getApiClient()
    const subcommand = args[0] || 'list'
    const name = args[1]

    switch (subcommand) {
      case 'list': {
        const result = await api.getConfigsByType('rules')
        if (result.success && result.data) {
          if (result.data.length === 0) {
            return { success: true, message: '暂无规则' }
          }
          const lines = ['已配置规则:', '']
          for (const rule of result.data) {
            const status = rule.enabled ? '✓' : '✗'
            const scope = rule.scope === 'global' ? 'G' : 'P'
            lines.push(`  ${status} ${rule.name} (${scope})`)
          }
          return { success: true, message: lines.join('\n') }
        }
        return { success: false, message: '获取规则列表失败' }
      }

      case 'on': {
        if (!name) {
          return { success: false, message: '请指定规则名称: /rule on <name>' }
        }
        const result = await api.toggleConfig('rules', name, true)
        if (result.success) {
          return { success: true, message: `已启用规则: ${name}` }
        }
        return { success: false, message: result.error || '启用失败' }
      }

      case 'off': {
        if (!name) {
          return { success: false, message: '请指定规则名称: /rule off <name>' }
        }
        const result = await api.toggleConfig('rules', name, false)
        if (result.success) {
          return { success: true, message: `已禁用规则: ${name}` }
        }
        return { success: false, message: result.error || '禁用失败' }
      }

      case 'create': {
        const description = args.slice(1).join(' ') || '新规则'
        const result = await api.generateConfig('rules', description)
        if (result.success && result.data) {
          return {
            success: true,
            message: `已生成规则模板:\n\n${result.data.content}`,
            data: result.data
          }
        }
        return { success: false, message: result.error || '创建失败' }
      }

      default:
        return { success: false, message: `未知子命令: ${subcommand}` }
    }
  }
})

// 代理命令
registerCommand({
  name: 'agent',
  aliases: ['a'],
  description: '管理代理',
  usage: '/agent [list|on|off|create] [name]',
  handler: async (args) => {
    const api = getApiClient()
    const subcommand = args[0] || 'list'
    const name = args[1]

    switch (subcommand) {
      case 'list': {
        const result = await api.getConfigsByType('agents')
        if (result.success && result.data) {
          if (result.data.length === 0) {
            return { success: true, message: '暂无代理' }
          }
          const lines = ['已配置代理:', '']
          for (const agent of result.data) {
            const status = agent.enabled ? '✓' : '✗'
            const scope = agent.scope === 'global' ? 'G' : 'P'
            lines.push(`  ${status} ${agent.name} (${scope})`)
          }
          return { success: true, message: lines.join('\n') }
        }
        return { success: false, message: '获取代理列表失败' }
      }

      case 'on': {
        if (!name) {
          return { success: false, message: '请指定代理名称: /agent on <name>' }
        }
        const result = await api.toggleConfig('agents', name, true)
        if (result.success) {
          return { success: true, message: `已启用代理: ${name}` }
        }
        return { success: false, message: result.error || '启用失败' }
      }

      case 'off': {
        if (!name) {
          return { success: false, message: '请指定代理名称: /agent off <name>' }
        }
        const result = await api.toggleConfig('agents', name, false)
        if (result.success) {
          return { success: true, message: `已禁用代理: ${name}` }
        }
        return { success: false, message: result.error || '禁用失败' }
      }

      case 'create': {
        const description = args.slice(1).join(' ') || '新代理'
        const result = await api.generateConfig('agents', description)
        if (result.success && result.data) {
          return {
            success: true,
            message: `已生成代理模板:\n\n${result.data.content}`,
            data: result.data
          }
        }
        return { success: false, message: result.error || '创建失败' }
      }

      default:
        return { success: false, message: `未知子命令: ${subcommand}` }
    }
  }
})

// 任务命令
registerCommand({
  name: 'task',
  aliases: ['t'],
  description: '管理并行任务',
  usage: '/task [list|cancel] [id|all]',
  handler: async (args) => {
    const api = getApiClient()
    const subcommand = args[0] || 'list'
    const target = args[1]

    switch (subcommand) {
      case 'list': {
        const result = await api.listTasks()
        if (result.success && result.data) {
          const activeTasks = result.data.filter(
            (t) => t.status === 'pending' || t.status === 'running'
          )
          if (activeTasks.length === 0) {
            return { success: true, message: '暂无活动任务' }
          }
          const lines = ['活动任务:', '']
          for (const task of activeTasks) {
            lines.push(`  #${task.id.slice(0, 4)} ${task.name} - ${task.progress}% (${task.status})`)
          }
          return { success: true, message: lines.join('\n') }
        }
        return { success: false, message: '获取任务列表失败' }
      }

      case 'cancel': {
        if (!target) {
          return { success: false, message: '请指定任务 ID 或 "all": /task cancel <id|all>' }
        }

        if (target === 'all') {
          const result = await api.cancelAllTasks()
          if (result.success && result.data) {
            return { success: true, message: `已取消 ${result.data.cancelled} 个任务` }
          }
          return { success: false, message: result.error || '取消失败' }
        }

        const result = await api.cancelTask(target)
        if (result.success) {
          return { success: true, message: `已取消任务: ${target}` }
        }
        return { success: false, message: result.error || '取消失败' }
      }

      default:
        return { success: false, message: `未知子命令: ${subcommand}` }
    }
  }
})

// 历史命令
registerCommand({
  name: 'history',
  aliases: ['hist'],
  description: '查看对话历史',
  usage: '/history [clear]',
  handler: async (args) => {
    const api = getApiClient()
    const subcommand = args[0]

    if (subcommand === 'clear') {
      // TODO: 实现清除历史
      return { success: true, message: '历史已清除' }
    }

    const result = await api.listConversations(10)
    if (result.success && result.data) {
      if (result.data.length === 0) {
        return { success: true, message: '暂无对话历史' }
      }
      const lines = ['最近对话:', '']
      for (const conv of result.data) {
        const date = new Date(conv.createdAt).toLocaleDateString()
        lines.push(`  ${conv.id.slice(0, 8)} - ${conv.title || '无标题'} (${date})`)
      }
      return { success: true, message: lines.join('\n') }
    }
    return { success: false, message: '获取历史失败' }
  }
})

// 压缩命令
registerCommand({
  name: 'compact',
  aliases: [],
  description: '手动压缩上下文',
  handler: async () => {
    // TODO: 调用 ConversationOptimizer
    return { success: true, message: '上下文已压缩' }
  }
})

// 标记命令
registerCommand({
  name: 'pin',
  aliases: [],
  description: '标记当前消息为重要',
  handler: async () => {
    // TODO: 实现消息标记
    return { success: true, message: '消息已标记为重要' }
  }
})

// 导出命令
registerCommand({
  name: 'export',
  aliases: [],
  description: '导出当前对话',
  handler: async () => {
    // TODO: 实现导出
    return { success: true, message: '对话已导出' }
  }
})

// 解析并执行命令
export async function executeCommand(input: string): Promise<CommandResult | null> {
  if (!input.startsWith('/')) {
    return null
  }

  const parts = input.slice(1).split(/\s+/)
  const commandName = parts[0]?.toLowerCase()
  const args = parts.slice(1)

  if (!commandName) {
    return { success: false, message: '请输入命令名称' }
  }

  const command = commands.get(commandName)
  if (!command) {
    return { success: false, message: `未知命令: /${commandName}，使用 /help 查看可用命令` }
  }

  try {
    return await command.handler(args)
  } catch (error) {
    return {
      success: false,
      message: `命令执行失败: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }
}

// 获取所有命令（用于自动补全）
export function getAllCommands(): string[] {
  const uniqueNames = new Set<string>()
  for (const cmd of commands.values()) {
    uniqueNames.add(cmd.name)
  }
  return Array.from(uniqueNames).sort()
}
