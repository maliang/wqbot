import { watch, type FSWatcher } from 'chokidar'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createModuleLogger } from './logger.js'
import { emit } from './events.js'

const logger = createModuleLogger('config-watcher')

// 配置类型
export type ConfigType = 'rules' | 'skills' | 'agents'

// 配置项
export interface ConfigItem {
  readonly name: string
  readonly type: ConfigType
  readonly scope: 'global' | 'project'
  readonly enabled: boolean
  readonly path: string
  readonly content?: string
  readonly updatedAt: Date
}

// 配置变更事件
export interface ConfigChangeEvent {
  readonly type: ConfigType
  readonly name: string
  readonly scope: 'global' | 'project'
  readonly action: 'created' | 'updated' | 'deleted'
  readonly path: string
}

// 配置变更回调
export type ConfigChangeCallback = (event: ConfigChangeEvent) => void | Promise<void>

// 配置目录
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.wqbot')

export class ConfigWatcher {
  private watchers: FSWatcher[] = []
  private callbacks: Set<ConfigChangeCallback> = new Set()
  private configCache: Map<string, ConfigItem> = new Map()
  private projectDir: string
  private disabledConfigs: Set<string> = new Set()

  constructor(projectDir?: string) {
    this.projectDir = projectDir ?? process.cwd()
  }

  // 获取配置目录
  private getConfigDir(scope: 'global' | 'project'): string {
    return scope === 'global' ? GLOBAL_CONFIG_DIR : path.join(this.projectDir, '.wqbot')
  }

  // 生成配置键
  private getConfigKey(type: ConfigType, name: string, scope: 'global' | 'project'): string {
    return `${scope}:${type}:${name}`
  }

  // 解析文件路径获取配置信息
  private parseFilePath(filePath: string): { type: ConfigType; name: string; scope: 'global' | 'project' } | null {
    const normalizedPath = filePath.replace(/\\/g, '/')
    const globalDir = GLOBAL_CONFIG_DIR.replace(/\\/g, '/')
    const projectDir = path.join(this.projectDir, '.wqbot').replace(/\\/g, '/')

    let scope: 'global' | 'project'
    let relativePath: string

    if (normalizedPath.startsWith(globalDir)) {
      scope = 'global'
      relativePath = normalizedPath.slice(globalDir.length + 1)
    } else if (normalizedPath.startsWith(projectDir)) {
      scope = 'project'
      relativePath = normalizedPath.slice(projectDir.length + 1)
    } else {
      return null
    }

    const parts = relativePath.split('/')
    if (parts.length < 2) {
      return null
    }

    const type = parts[0] as ConfigType
    if (!['rules', 'skills', 'agents'].includes(type)) {
      return null
    }

    const fileName = parts[parts.length - 1]
    if (!fileName) {
      return null
    }
    const name = path.parse(fileName).name

    return { type, name, scope }
  }

  // 启动监听
  async start(): Promise<void> {
    // 确保目录存在
    await this.ensureDirectories()

    // 加载初始配置
    await this.loadAllConfigs()

    // 监听全局配置目录
    const globalWatcher = watch(GLOBAL_CONFIG_DIR, {
      persistent: true,
      ignoreInitial: true,
      depth: 2,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    })

    globalWatcher
      .on('add', (filePath) => this.handleFileChange(filePath, 'created'))
      .on('change', (filePath) => this.handleFileChange(filePath, 'updated'))
      .on('unlink', (filePath) => this.handleFileChange(filePath, 'deleted'))

    this.watchers.push(globalWatcher)

    // 监听项目配置目录
    const projectConfigDir = path.join(this.projectDir, '.wqbot')
    try {
      await fs.access(projectConfigDir)
      const projectWatcher = watch(projectConfigDir, {
        persistent: true,
        ignoreInitial: true,
        depth: 2,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      })

      projectWatcher
        .on('add', (filePath) => this.handleFileChange(filePath, 'created'))
        .on('change', (filePath) => this.handleFileChange(filePath, 'updated'))
        .on('unlink', (filePath) => this.handleFileChange(filePath, 'deleted'))

      this.watchers.push(projectWatcher)
    } catch {
      // 项目配置目录不存在，跳过
    }

    logger.info('配置监听已启动', {
      globalDir: GLOBAL_CONFIG_DIR,
      projectDir: projectConfigDir
    })
  }

  // 停止监听
  async stop(): Promise<void> {
    for (const watcher of this.watchers) {
      await watcher.close()
    }
    this.watchers = []
    logger.info('配置监听已停止')
  }

  // 确保配置目录存在
  private async ensureDirectories(): Promise<void> {
    const dirs = [
      path.join(GLOBAL_CONFIG_DIR, 'rules'),
      path.join(GLOBAL_CONFIG_DIR, 'skills'),
      path.join(GLOBAL_CONFIG_DIR, 'agents')
    ]

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true })
      } catch {
        // 目录已存在
      }
    }
  }

  // 处理文件变更
  private async handleFileChange(
    filePath: string,
    action: 'created' | 'updated' | 'deleted'
  ): Promise<void> {
    const parsed = this.parseFilePath(filePath)
    if (!parsed) {
      return
    }

    const { type, name, scope } = parsed
    const key = this.getConfigKey(type, name, scope)

    if (action === 'deleted') {
      this.configCache.delete(key)
    } else {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const stat = await fs.stat(filePath)

        const item: ConfigItem = {
          name,
          type,
          scope,
          enabled: !this.disabledConfigs.has(key),
          path: filePath,
          content,
          updatedAt: stat.mtime
        }

        this.configCache.set(key, item)
      } catch (error) {
        logger.error('读取配置文件失败', error instanceof Error ? error : new Error(String(error)), { filePath })
        return
      }
    }

    const event: ConfigChangeEvent = {
      type,
      name,
      scope,
      action,
      path: filePath
    }

    logger.debug('配置变更', { type, name, scope, action, filePath })

    // 触发回调
    for (const callback of this.callbacks) {
      try {
        await callback(event)
      } catch (error) {
        logger.error('配置变更回调执行失败', error instanceof Error ? error : new Error(String(error)))
      }
    }

    // 发送系统事件
    emit('skill:execute', {
      event: 'config:change',
      ...event
    })
  }

  // 加载所有配置
  private async loadAllConfigs(): Promise<void> {
    const scopes: Array<'global' | 'project'> = ['global', 'project']
    const types: ConfigType[] = ['rules', 'skills', 'agents']

    for (const scope of scopes) {
      for (const type of types) {
        const dir = path.join(this.getConfigDir(scope), type)
        try {
          const files = await fs.readdir(dir)
          for (const file of files) {
            const filePath = path.join(dir, file)
            const stat = await fs.stat(filePath)
            if (stat.isFile()) {
              const name = path.parse(file).name
              const key = this.getConfigKey(type, name, scope)
              const content = await fs.readFile(filePath, 'utf-8')

              this.configCache.set(key, {
                name,
                type,
                scope,
                enabled: !this.disabledConfigs.has(key),
                path: filePath,
                content,
                updatedAt: stat.mtime
              })
            }
          }
        } catch {
          // 目录不存在
        }
      }
    }

    logger.info('配置加载完成', { count: this.configCache.size })
  }

  // 注册变更回调
  onChange(callback: ConfigChangeCallback): () => void {
    this.callbacks.add(callback)
    return () => {
      this.callbacks.delete(callback)
    }
  }

  // 获取所有配置
  getAll(): readonly ConfigItem[] {
    return Array.from(this.configCache.values())
  }

  // 获取指定类型的配置
  getByType(type: ConfigType): readonly ConfigItem[] {
    return Array.from(this.configCache.values()).filter((item) => item.type === type)
  }

  // 获取指定范围的配置
  getByScope(scope: 'global' | 'project'): readonly ConfigItem[] {
    return Array.from(this.configCache.values()).filter((item) => item.scope === scope)
  }

  // 获取单个配置
  get(type: ConfigType, name: string, scope?: 'global' | 'project'): ConfigItem | undefined {
    // 优先返回项目级配置
    if (!scope || scope === 'project') {
      const projectKey = this.getConfigKey(type, name, 'project')
      const projectConfig = this.configCache.get(projectKey)
      if (projectConfig) {
        return projectConfig
      }
    }

    if (!scope || scope === 'global') {
      const globalKey = this.getConfigKey(type, name, 'global')
      return this.configCache.get(globalKey)
    }

    return undefined
  }

  // 获取生效的配置（项目级覆盖全局）
  getEffective(): readonly ConfigItem[] {
    const effectiveMap = new Map<string, ConfigItem>()

    // 先添加全局配置
    for (const item of this.configCache.values()) {
      if (item.scope === 'global' && item.enabled) {
        effectiveMap.set(`${item.type}:${item.name}`, item)
      }
    }

    // 项目配置覆盖全局
    for (const item of this.configCache.values()) {
      if (item.scope === 'project' && item.enabled) {
        effectiveMap.set(`${item.type}:${item.name}`, item)
      }
    }

    return Array.from(effectiveMap.values())
  }

  // 启用配置
  enable(type: ConfigType, name: string, scope: 'global' | 'project'): void {
    const key = this.getConfigKey(type, name, scope)
    this.disabledConfigs.delete(key)

    const item = this.configCache.get(key)
    if (item) {
      this.configCache.set(key, { ...item, enabled: true })
    }
  }

  // 禁用配置
  disable(type: ConfigType, name: string, scope: 'global' | 'project'): void {
    const key = this.getConfigKey(type, name, scope)
    this.disabledConfigs.add(key)

    const item = this.configCache.get(key)
    if (item) {
      this.configCache.set(key, { ...item, enabled: false })
    }
  }

  // 检查配置是否启用
  isEnabled(type: ConfigType, name: string, scope: 'global' | 'project'): boolean {
    const key = this.getConfigKey(type, name, scope)
    return !this.disabledConfigs.has(key)
  }

  // 刷新配置
  async refresh(): Promise<void> {
    this.configCache.clear()
    await this.loadAllConfigs()
  }
}

// 单例实例
let watcherInstance: ConfigWatcher | null = null

export function getConfigWatcher(): ConfigWatcher {
  if (!watcherInstance) {
    watcherInstance = new ConfigWatcher()
  }
  return watcherInstance
}

export async function initializeConfigWatcher(projectDir?: string): Promise<ConfigWatcher> {
  watcherInstance = new ConfigWatcher(projectDir)
  await watcherInstance.start()
  return watcherInstance
}

export async function stopConfigWatcher(): Promise<void> {
  if (watcherInstance) {
    await watcherInstance.stop()
    watcherInstance = null
  }
}
