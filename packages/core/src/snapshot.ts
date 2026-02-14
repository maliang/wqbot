import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createModuleLogger } from './logger.js'

const execFileAsync = promisify(execFile)
const logger = createModuleLogger('snapshot')

export interface SnapshotInfo {
  readonly hash: string
  readonly timestamp: string
  readonly message?: string | undefined
  readonly changedFiles: readonly string[]
}

// 将项目目录哈希为 projectId
function projectId(projectDir: string): string {
  return crypto.createHash('sha256').update(path.resolve(projectDir)).digest('hex').slice(0, 16)
}

// 快照仓库根目录
function snapshotRoot(): string {
  return path.join(os.homedir(), '.wqbot', 'data', 'snapshot')
}

// 获取项目对应的快照 git 目录
function gitDir(projectDir: string): string {
  return path.join(snapshotRoot(), projectId(projectDir))
}

// 执行 git 命令，隔离 --git-dir 和 --work-tree
async function git(
  projectDir: string,
  args: readonly string[]
): Promise<string> {
  const dir = gitDir(projectDir)
  const fullArgs = [
    `--git-dir=${dir}`,
    `--work-tree=${path.resolve(projectDir)}`,
    ...args,
  ]
  const { stdout } = await execFileAsync('git', fullArgs as string[], {
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout.trim()
}

// 仅操作 bare 仓库自身的 git 命令（不需要 work-tree）
async function gitBare(
  projectDir: string,
  args: readonly string[]
): Promise<string> {
  const dir = gitDir(projectDir)
  const fullArgs = [`--git-dir=${dir}`, ...args]
  const { stdout } = await execFileAsync('git', fullArgs as string[], {
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout.trim()
}

export class SnapshotManager {
  /**
   * 初始化快照仓库（bare git repo）
   */
  async initialize(projectDir: string): Promise<void> {
    const dir = gitDir(projectDir)
    if (fs.existsSync(path.join(dir, 'HEAD'))) {
      return // 已初始化
    }
    await fs.promises.mkdir(dir, { recursive: true })
    await execFileAsync('git', ['init', '--bare', dir], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    logger.info('快照仓库已初始化', { projectDir, gitDir: dir })
  }

  /**
   * 创建快照：将当前工作目录的文件状态记录到快照仓库
   */
  async track(projectDir: string, message?: string): Promise<SnapshotInfo> {
    await this.initialize(projectDir)

    // git add -A（通过 work-tree 追踪所有文件）
    await git(projectDir, ['add', '-A'])

    // 获取变更文件列表
    let changedFiles: string[] = []
    try {
      const diff = await git(projectDir, ['diff', '--cached', '--name-only'])
      changedFiles = diff ? diff.split('\n').filter(Boolean) : []
    } catch {
      // 首次提交没有 HEAD，用 ls-files 代替
      const files = await git(projectDir, ['ls-files', '--cached'])
      changedFiles = files ? files.split('\n').filter(Boolean) : []
    }

    // 创建提交
    const timestamp = new Date().toISOString()
    const commitMessage = message ?? `snapshot ${timestamp}`

    try {
      await git(projectDir, [
        'commit',
        '--allow-empty',
        '-m',
        commitMessage,
      ])
    } catch (error) {
      // 如果没有变更，commit 会失败，但我们仍然返回当前 HEAD
      logger.debug('提交快照时无变更或出错', { error })
    }

    // 获取 HEAD hash
    const hash = await gitBare(projectDir, ['rev-parse', 'HEAD'])

    const info: SnapshotInfo = {
      hash,
      timestamp,
      message: commitMessage,
      changedFiles,
    }

    logger.info('快照已创建', { hash, files: changedFiles.length })
    return info
  }

  /**
   * 恢复到指定快照（整个工作目录）
   */
  async revert(projectDir: string, hash: string): Promise<void> {
    await this.initialize(projectDir)

    // read-tree 将指定提交的树读入索引
    await git(projectDir, ['read-tree', hash])

    // checkout-index 将索引内容写入工作目录
    await git(projectDir, ['checkout-index', '-a', '-f'])

    logger.info('已恢复到快照', { hash })
  }

  /**
   * 恢复单个文件到指定快照的版本
   */
  async restoreFile(
    projectDir: string,
    hash: string,
    filePath: string
  ): Promise<void> {
    await this.initialize(projectDir)

    // 从指定提交中读取文件内容
    const content = await git(projectDir, ['show', `${hash}:${filePath}`])

    // 写入工作目录
    const fullPath = path.resolve(projectDir, filePath)
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.promises.writeFile(fullPath, content, 'utf-8')

    logger.info('已恢复文件', { hash, filePath })
  }

  /**
   * 列出快照历史
   */
  async list(
    projectDir: string,
    limit: number = 50
  ): Promise<readonly SnapshotInfo[]> {
    await this.initialize(projectDir)

    let logOutput: string
    try {
      logOutput = await gitBare(projectDir, [
        'log',
        `--max-count=${limit}`,
        '--format=%H|%aI|%s',
      ])
    } catch {
      // 没有提交记录
      return []
    }

    if (!logOutput) {
      return []
    }

    const snapshots: SnapshotInfo[] = []

    for (const line of logOutput.split('\n')) {
      if (!line) continue
      const [hash, timestamp, ...messageParts] = line.split('|')
      if (!hash || !timestamp) continue

      // 获取该提交的变更文件
      let changedFiles: string[] = []
      try {
        const diff = await gitBare(projectDir, [
          'diff-tree',
          '--no-commit-id',
          '--name-only',
          '-r',
          hash,
        ])
        changedFiles = diff ? diff.split('\n').filter(Boolean) : []
      } catch {
        // 忽略
      }

      snapshots.push({
        hash,
        timestamp,
        message: messageParts.join('|') || undefined,
        changedFiles,
      })
    }

    return snapshots
  }

  /**
   * 清理过期快照
   *
   * 通过 git rebase 将过期提交从历史中移除，使其变为不可达对象，
   * 然后执行 git gc 回收空间。
   */
  async cleanup(
    projectDir: string,
    maxAgeHours: number = 72
  ): Promise<number> {
    await this.initialize(projectDir)

    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000)
    const all = await this.list(projectDir, 1000)

    // 找到最新的过期快照索引（all 按时间倒序）
    let keepFromIndex = 0
    for (let i = 0; i < all.length; i++) {
      const snap = all[i]!
      if (new Date(snap.timestamp) < cutoff) {
        keepFromIndex = i
        break
      }
    }

    const removed = all.length - keepFromIndex
    if (removed <= 0 || keepFromIndex === 0) {
      return 0
    }

    // 将 HEAD 重置到最新的未过期快照，丢弃过期提交
    const newestKeep = all[keepFromIndex - 1]
    if (newestKeep) {
      try {
        await gitBare(projectDir, ['update-ref', 'refs/heads/master', newestKeep.hash])
        await gitBare(projectDir, ['update-ref', 'HEAD', newestKeep.hash])
      } catch {
        // 引用更新失败，跳过清理
        return 0
      }
    }

    // gc 回收不可达对象
    try {
      await gitBare(projectDir, ['reflog', 'expire', '--expire=now', '--all'])
      await gitBare(projectDir, ['gc', '--prune=now'])
    } catch {
      // gc 失败不影响功能
    }

    logger.info('已清理过期快照', { removed, maxAgeHours })
    return removed
  }
}

// 单例
let snapshotManagerInstance: SnapshotManager | null = null

export function getSnapshotManager(): SnapshotManager {
  if (!snapshotManagerInstance) {
    snapshotManagerInstance = new SnapshotManager()
  }
  return snapshotManagerInstance
}
