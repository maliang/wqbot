import type { FastifyInstance } from 'fastify'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getConfigWatcher } from '@wqbot/core'
import { getSSEManager } from '../sse.js'
import type { ApiResponse, ConfigItem, ConfigType, ConfigGenerateRequest } from '../types.js'

// 配置目录路径
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.wqbot')
const PROJECT_CONFIG_DIR = '.wqbot'

// 获取配置目录
function getConfigDir(scope: 'global' | 'project'): string {
  return scope === 'global' ? GLOBAL_CONFIG_DIR : path.resolve(PROJECT_CONFIG_DIR)
}

// 确保目录存在
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true })
  } catch {
    // 目录已存在
  }
}

// 读取配置文件列表
async function listConfigFiles(type: ConfigType, scope: 'global' | 'project'): Promise<ConfigItem[]> {
  const baseDir = getConfigDir(scope)
  const typeDir = path.join(baseDir, type)

  try {
    const files = await fs.readdir(typeDir)
    const items: ConfigItem[] = []

    for (const file of files) {
      const filePath = path.join(typeDir, file)
      const stat = await fs.stat(filePath)

      if (stat.isFile()) {
        const name = path.parse(file).name
        items.push({
          name,
          type,
          scope,
          enabled: true, // TODO: 从配置文件读取启用状态
          path: filePath,
          updatedAt: stat.mtime,
        })
      }
    }

    return items
  } catch {
    return []
  }
}

// 读取配置文件内容
async function readConfigFile(type: ConfigType, name: string, scope: 'global' | 'project'): Promise<string | null> {
  const baseDir = getConfigDir(scope)
  const extensions = type === 'skills' ? ['.ts', '.js'] : ['.md']

  for (const ext of extensions) {
    const filePath = path.join(baseDir, type, `${name}${ext}`)
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch {
      // 文件不存在，尝试下一个扩展名
    }
  }

  return null
}

// 写入配置文件
async function writeConfigFile(
  type: ConfigType,
  name: string,
  content: string,
  scope: 'global' | 'project'
): Promise<string> {
  const baseDir = getConfigDir(scope)
  const typeDir = path.join(baseDir, type)
  await ensureDir(typeDir)

  const ext = type === 'skills' ? '.ts' : '.md'
  const filePath = path.join(typeDir, `${name}${ext}`)

  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

// 删除配置文件
async function deleteConfigFile(type: ConfigType, name: string, scope: 'global' | 'project'): Promise<boolean> {
  const baseDir = getConfigDir(scope)
  const extensions = type === 'skills' ? ['.ts', '.js'] : ['.md']

  for (const ext of extensions) {
    const filePath = path.join(baseDir, type, `${name}${ext}`)
    try {
      await fs.unlink(filePath)
      return true
    } catch {
      // 文件不存在，尝试下一个扩展名
    }
  }

  return false
}

export async function configRoutes(fastify: FastifyInstance): Promise<void> {
  const sseManager = getSSEManager()

  // 获取所有配置
  fastify.get('/api/config', async (_request, reply) => {
    const globalRules = await listConfigFiles('rules', 'global')
    const globalSkills = await listConfigFiles('skills', 'global')
    const globalAgents = await listConfigFiles('agents', 'global')

    const projectRules = await listConfigFiles('rules', 'project')
    const projectSkills = await listConfigFiles('skills', 'project')
    const projectAgents = await listConfigFiles('agents', 'project')

    const allConfigs = [
      ...globalRules,
      ...globalSkills,
      ...globalAgents,
      ...projectRules,
      ...projectSkills,
      ...projectAgents
    ]

    const response: ApiResponse<ConfigItem[]> = {
      success: true,
      data: allConfigs,
      meta: {
        total: allConfigs.length
      }
    }
    return reply.send(response)
  })

  // 获取指定类型的配置
  fastify.get<{
    Params: { type: ConfigType }
    Querystring: { scope?: 'global' | 'project' }
  }>('/api/config/:type', async (request, reply) => {
    const { type } = request.params
    const { scope } = request.query

    if (!['rules', 'skills', 'agents'].includes(type)) {
      const response: ApiResponse = {
        success: false,
        error: '无效的配置类型'
      }
      return reply.status(400).send(response)
    }

    let configs: ConfigItem[] = []

    if (!scope || scope === 'global') {
      configs = [...configs, ...(await listConfigFiles(type, 'global'))]
    }
    if (!scope || scope === 'project') {
      configs = [...configs, ...(await listConfigFiles(type, 'project'))]
    }

    const response: ApiResponse<ConfigItem[]> = {
      success: true,
      data: configs,
      meta: {
        total: configs.length
      }
    }
    return reply.send(response)
  })

  // 获取单个配置内容
  fastify.get<{
    Params: { type: ConfigType; name: string }
    Querystring: { scope?: 'global' | 'project' }
  }>('/api/config/:type/:name', async (request, reply) => {
    const { type, name } = request.params
    const scope = request.query.scope || 'project'

    // 优先读取项目级配置
    let content = await readConfigFile(type, name, 'project')
    let actualScope: 'global' | 'project' = 'project'

    if (!content && scope !== 'project') {
      content = await readConfigFile(type, name, 'global')
      actualScope = 'global'
    }

    if (!content) {
      const response: ApiResponse = {
        success: false,
        error: '配置不存在'
      }
      return reply.status(404).send(response)
    }

    const response: ApiResponse<ConfigItem> = {
      success: true,
      data: {
        name,
        type,
        scope: actualScope,
        enabled: true,
        path: '',
        content,
        updatedAt: new Date(),
      }
    }
    return reply.send(response)
  })

  // 创建或更新配置
  fastify.put<{
    Params: { type: ConfigType; name: string }
    Body: { content: string; scope?: 'global' | 'project' }
  }>('/api/config/:type/:name', async (request, reply) => {
    const { type, name } = request.params
    const { content, scope = 'project' } = request.body

    if (!['rules', 'skills', 'agents'].includes(type)) {
      const response: ApiResponse = {
        success: false,
        error: '无效的配置类型'
      }
      return reply.status(400).send(response)
    }

    try {
      const filePath = await writeConfigFile(type, name, content, scope)

      // 通知所有客户端配置已更新
      sseManager.sendConfigChange(type, name, 'updated')

      const response: ApiResponse<{ path: string }> = {
        success: true,
        data: { path: filePath }
      }
      return reply.send(response)
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : '保存失败'
      }
      return reply.status(500).send(response)
    }
  })

  // 删除配置
  fastify.delete<{
    Params: { type: ConfigType; name: string }
    Querystring: { scope?: 'global' | 'project' }
  }>('/api/config/:type/:name', async (request, reply) => {
    const { type, name } = request.params
    const scope = request.query.scope || 'project'

    const deleted = await deleteConfigFile(type, name, scope)

    if (!deleted) {
      const response: ApiResponse = {
        success: false,
        error: '配置不存在'
      }
      return reply.status(404).send(response)
    }

    // 通知所有客户端配置已删除
    sseManager.sendConfigChange(type, name, 'deleted')

    const response: ApiResponse = {
      success: true
    }
    return reply.send(response)
  })

  // AI 生成配置
  fastify.post<{
    Body: ConfigGenerateRequest
  }>('/api/config/generate', async (request, reply) => {
    const { type, description, scope } = request.body

    // TODO: 调用 AI 模型生成配置内容
    // 这里先返回一个模板

    let template = ''

    switch (type) {
      case 'rules':
        template = `# ${description}\n\n## 规则说明\n\n请在此处添加规则内容...\n`
        break
      case 'skills':
        template = `// ${description}\n\nimport type { SkillInput, SkillOutput } from '@wqbot/core'\n\nexport async function execute(input: SkillInput): Promise<SkillOutput> {\n  // TODO: 实现技能逻辑\n  return {\n    success: true,\n    data: {}\n  }\n}\n`
        break
      case 'agents':
        template = `---\nname: new-agent\ndescription: ${description}\nmode: primary\ntriggers: []\n---\n\n你是一个专业的助手...\n`
        break
    }

    const response: ApiResponse<{ content: string; type: ConfigType; scope: 'global' | 'project' }> = {
      success: true,
      data: {
        content: template,
        type,
        scope
      }
    }
    return reply.send(response)
  })

  // 启用/禁用配置
  fastify.post<{
    Params: { type: ConfigType; name: string }
    Body: { enabled: boolean; scope?: 'global' | 'project' }
  }>('/api/config/:type/:name/toggle', async (request, reply) => {
    const { type, name } = request.params
    const { enabled, scope = 'project' } = request.body

    const configWatcher = getConfigWatcher()

    if (enabled) {
      configWatcher.enable(type, name, scope)
    } else {
      configWatcher.disable(type, name, scope)
    }

    sseManager.sendConfigChange(type, name, 'updated')

    const response: ApiResponse<{ enabled: boolean }> = {
      success: true,
      data: { enabled }
    }
    return reply.send(response)
  })

  // POST /api/mcp/reload — 手动触发 MCP 全量重载
  fastify.post('/api/mcp/reload', async (_request, reply) => {
    try {
      const { getConfigManager } = await import('@wqbot/core')
      await getConfigManager().reloadConfig()

      const { getMCPClientManager, getToolRegistry } = await import('@wqbot/skills')
      const mcpManager = getMCPClientManager()
      await mcpManager.reload()

      const toolRegistry = getToolRegistry()
      for (const toolDef of mcpManager.getToolDefinitions()) {
        toolRegistry.register(toolDef)
      }

      sseManager.sendConfigChange('mcp', 'config', 'updated')
      return reply.send({ success: true, data: { status: mcpManager.getStatus() } })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      return reply.status(500).send({ success: false, error: message })
    }
  })

  // GET /api/mcp/status — 获取所有 MCP 服务器状态
  fastify.get('/api/mcp/status', async (_request, reply) => {
    const { getMCPClientManager } = await import('@wqbot/skills')
    const mcpManager = getMCPClientManager()
    return reply.send({ success: true, data: mcpManager.getStatus() })
  })
}
