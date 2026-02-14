import { initializeConfig, initializeLogger, setLocale, initializeConfigWatcher, stopConfigWatcher, initializeThemeManager } from '@wqbot/core'
import type { Locale } from '@wqbot/core'
import { initializeDatabase, getSettingsStore, initializeConversationOptimizer } from '@wqbot/storage'
import { initializeSkillRegistry, initializeMCPClient, getToolRegistry, initializeAgentManager, getSkillRegistry, getAgentManager, getMCPClientManager, registerKnowledgeTools } from '@wqbot/skills'
import { initializeModelRouter } from '@wqbot/models'
import { initializeKnowledge, getKnowledgeManager } from '@wqbot/knowledge'
import { initializeSandbox, initializePermissionManager, initializeAuditLog } from '@wqbot/security'
import { startServer, stopServer } from './server.js'
import { getSSEManager } from './sse.js'

const DEFAULT_PORT = 3721
const DEFAULT_HOST = '127.0.0.1'

async function main(): Promise<void> {
  // 解析命令行参数
  const args = process.argv.slice(2)
  let port = DEFAULT_PORT
  let host = DEFAULT_HOST

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--port' || arg === '-p') {
      const portArg = args[i + 1]
      if (portArg) {
        port = parseInt(portArg, 10)
        i++
      }
    } else if (arg === '--host' || arg === '-h') {
      const hostArg = args[i + 1]
      if (hostArg) {
        host = hostArg
        i++
      }
    } else if (arg === '--help') {
      console.log(`
WQBot Backend Server

用法: wqbot-server [选项]

选项:
  -p, --port <port>  服务端口 (默认: ${DEFAULT_PORT})
  -h, --host <host>  服务地址 (默认: ${DEFAULT_HOST})
  --help             显示帮助信息

示例:
  wqbot-server
  wqbot-server --port 8080
  wqbot-server --host 0.0.0.0 --port 3000
`)
      process.exit(0)
    }
  }

  console.log('正在初始化 WQBot 后端服务...\n')

  // 初始化核心系统
  try {
    await initializeConfig()
    initializeLogger()
    await initializeDatabase()
    initializeConversationOptimizer()

    // 加载语言设置
    const settings = getSettingsStore()
    const savedLanguage = settings.get('language')
    if (savedLanguage) {
      try {
        setLocale(savedLanguage as Locale)
      } catch {
        // 忽略无效的语言设置
      }
    }

    await initializeSkillRegistry()
    await initializeModelRouter()

    // 初始化知识库
    await initializeKnowledge()

    // 初始化 MCP 客户端（连接外部工具服务器）
    const mcpManager = await initializeMCPClient()

    // 将 MCP 工具注册到统一工具注册表
    const toolRegistry = getToolRegistry()
    for (const toolDef of mcpManager.getToolDefinitions()) {
      toolRegistry.register(toolDef)
    }

    // 初始化 Agent 管理器
    await initializeAgentManager()

    // 注册知识库工具到 ToolRegistry
    registerKnowledgeTools()

    // 初始化主题管理器（加载用户自定义主题）
    await initializeThemeManager()

    // 启动配置热加载
    const configWatcher = await initializeConfigWatcher()
    configWatcher.onChange(async (event) => {
      const sseManager = getSSEManager()

      try {
        switch (event.type) {
          case 'skills':
            await getSkillRegistry().reload()
            break
          case 'agents':
            await getAgentManager().reload()
            break
          case 'rules':
            // rules 无需 reload，由 chat 路由每次请求时读取生效配置
            break
          case 'mcp': {
            const { getConfigManager } = await import('@wqbot/core')
            await getConfigManager().reloadConfig()
            const mcpManager = getMCPClientManager()
            await mcpManager.reload()
            const toolRegistry = getToolRegistry()
            for (const toolDef of mcpManager.getToolDefinitions()) {
              toolRegistry.register(toolDef)
            }
            // 检查 knowledge 配置是否变更，一并重新加载
            try {
              await getKnowledgeManager().reload()
            } catch (knErr) {
              console.error('知识库热加载失败:', knErr)
            }
            break
          }
        }
      } catch (error) {
        console.error(`热加载失败 [${event.type}/${event.name}]:`, error)
      }

      // 广播变更到前端
      sseManager.sendConfigChange(event.type, event.name, event.action)
    })

    initializeSandbox()
    initializePermissionManager()
    initializeAuditLog()
  } catch (error) {
    console.error('初始化失败:', error)
    process.exit(1)
  }

  // 启动服务器
  try {
    await startServer({ host, port })
  } catch (error) {
    console.error('启动服务器失败:', error)
    process.exit(1)
  }

  // 优雅关闭
  const shutdown = async (): Promise<void> => {
    console.log('\n正在关闭服务器...')
    try {
      const { getMCPClientManager } = await import('@wqbot/skills')
      await getMCPClientManager().shutdown()
      await stopConfigWatcher()
      await stopServer()
      console.log('服务器已关闭')
      process.exit(0)
    } catch (error) {
      console.error('关闭服务器失败:', error)
      process.exit(1)
    }
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error('致命错误:', error)
  process.exit(1)
})
