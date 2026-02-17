/**
 * Shell Executor - Trusted Mode
 * 
 * Provides shell command execution with configurable trust levels.
 * Trust mode bypasses the security sandbox for trusted workflows.
 */

import { createModuleLogger } from '@wqbot/logger'
import { EventEmitter } from 'events'
import { exec, spawn, type ExecOptions, type SpawnOptions } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const logger = createModuleLogger('shell')

// ============================================================================
// Types
// ============================================================================

export interface ShellConfig {
  mode: ShellMode
  workingDirectory?: string
  timeout?: number
  env?: Record<string, string>
  shell?: string
  maxBuffer?: number
}

export type ShellMode = 'sandbox' | 'trust' | 'readonly'

export interface ShellCommand {
  id: string
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  timeout?: number
}

export interface ShellResult {
  id: string
  command: string
  exitCode: number | null
  stdout: string
  stderr: string
  duration: number
  success: boolean
  timestamp: Date
}

export interface ShellStreamResult {
  id: string
  type: 'stdout' | 'stderr' | 'error' | 'close'
  data: string
  exitCode?: number
}

export interface BlockedCommand {
  command: string
  reason: string
  blockedAt: Date
}

// Trust mode configuration
export interface TrustConfig {
  enabled: boolean
  allowedCommands?: string[]      // Whitelist of allowed commands
  blockedCommands?: string[]     // Blacklist of blocked commands
  allowedPaths?: string[]         // Whitelist of allowed working directories
  blockedPaths?: string[]        // Blacklist of blocked working directories
  requireApproval?: boolean       // Require approval for new commands
  approvalCallback?: (command: string) => Promise<boolean>
}

// Dangerous patterns that are always blocked
const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,                    // Recursive force delete root
  /:\(\)\{.*:\|&.*\}/,               // Fork bomb
  /dd\s+if=.*of=\/dev\/,              // Direct disk write
  /mkfs\./,                           // Format filesystem
  />\s*\/dev\/,                       // Device redirect
  /curl.*\|.*sh/i,                    // Pipe to shell (Curl)
  /wget.*\|.*sh/i,                    // Pipe to shell (Wget)
  /chmod\s+-R\s+777/,                // World-writable
  /chown\s+-R\s+/,                    // Recursive ownership change
  /:\!.*!/,                           // Shell bang escape
  /\|\s*bash/,                        // Pipe to bash
  /\|\s*sh/,                          // Pipe to shell
  /&&\s*rm/,                          // Chain with delete
  /\|\s*rm/,                          // Pipe with delete
  /sed\s+-i.*\/etc/,                  // Edit system files
  /tee\s+/,                           // Write to file
]

// ============================================================================
// Shell Executor
// ============================================================================

export class ShellExecutor {
  private config: ShellConfig
  private trustConfig: TrustConfig
  private blockedHistory: BlockedCommand[] = []
  private executionHistory: ShellResult[] = []
  private emitter: EventEmitter

  constructor(config?: Partial<ShellConfig>, trustConfig?: Partial<TrustConfig>) {
    this.config = {
      mode: config?.mode ?? 'sandbox',
      workingDirectory: config?.workingDirectory,
      timeout: config?.timeout ?? 60000,
      env: config?.env,
      shell: config?.shell,
      maxBuffer: config?.maxBuffer ?? 10 * 1024 * 1024, // 10MB
      ...config
    }

    this.trustConfig = {
      enabled: trustConfig?.enabled ?? false,
      allowedCommands: trustConfig?.allowedCommands ?? ['*'],
      blockedCommands: trustConfig?.blockedCommands ?? [],
      allowedPaths: trustConfig?.allowedPaths ?? ['*'],
      blockedPaths: trustConfig?.blockedPaths ?? [],
      requireApproval: trustConfig?.requireApproval ?? false,
      approvalCallback: trustConfig?.approvalCallback,
      ...trustConfig
    }

    this.emitter = new EventEmitter()
  }

  /**
   * Execute a command
   */
  async execute(command: string, options?: {
    cwd?: string
    env?: Record<string, string>
    timeout?: number
  }): Promise<ShellResult> {
    const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const startTime = Date.now()

    // Check if command is allowed
    const checkResult = await this.checkCommand(command, options?.cwd)
    if (!checkResult.allowed) {
      const result: ShellResult = {
        id,
        command,
        exitCode: null,
        stdout: '',
        stderr: checkResult.reason || 'Command blocked by security policy',
        duration: Date.now() - startTime,
        success: false,
        timestamp: new Date()
      }
      
      this.blockedHistory.push({
        command,
        reason: checkResult.reason || 'Command blocked',
        blockedAt: new Date()
      })
      
      this.emit({ type: 'command:blocked', command, reason: checkResult.reason })
      return result
    }

    // Execute command
    const execOptions: ExecOptions = {
      cwd: options?.cwd || this.config.workingDirectory,
      env: { ...process.env, ...this.config.env, ...options?.env },
      shell: this.config.shell,
      timeout: options?.timeout || this.config.timeout,
      maxBuffer: this.config.maxBuffer
    }

    logger.info('Executing command', { id, command, mode: this.config.mode })

    try {
      const { stdout, stderr } = await execAsync(command, execOptions)
      
      const result: ShellResult = {
        id,
        command,
        exitCode: 0,
        stdout,
        stderr,
        duration: Date.now() - startTime,
        success: true,
        timestamp: new Date()
      }

      this.executionHistory.push(result)
      this.emit({ type: 'command:completed', result })

      return result

    } catch (error) {
      const err = error as { code?: number; message?: string; stdout?: string; stderr?: string }
      
      const result: ShellResult = {
        id,
        command,
        exitCode: err.code ?? -1,
        stdout: err.stdout || '',
        stderr: err.stderr || err.message || '',
        duration: Date.now() - startTime,
        success: false,
        timestamp: new Date()
      }

      this.executionHistory.push(result)
      this.emit({ type: 'command:failed', result })

      return result
    }
  }

  /**
   * Execute a command with streaming output
   */
  executeStream(
    command: string,
    callback: (event: ShellStreamResult) => void,
    options?: {
      cwd?: string
      env?: Record<string, string>
    }
  ): { id: string; kill: () => void } {
    const id = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    
    const spawnOptions: SpawnOptions = {
      cwd: options?.cwd || this.config.workingDirectory,
      env: { ...process.env, ...this.config.env, ...options?.env },
      shell: this.config.shell ?? true,
      stdio: ['ignore', 'pipe', 'pipe']
    }

    const child = spawn(command, [], spawnOptions)

    let killed = false

    child.stdout?.on('data', (data: Buffer) => {
      callback({ id, type: 'stdout', data: data.toString() })
    })

    child.stderr?.on('data', (data: Buffer) => {
      callback({ id, type: 'stderr', data: data.toString() })
    })

    child.on('error', (error) => {
      callback({ id, type: 'error', data: error.message })
    })

    child.on('close', (code) => {
      if (!killed) {
        callback({ id, type: 'close', data: '', exitCode: code ?? undefined })
      }
    })

    return {
      id,
      kill: () => {
        killed = true
        child.kill()
      }
    }
  }

  /**
   * Check if command is allowed
   */
  private async checkCommand(command: string, cwd?: string): Promise<{ allowed: boolean; reason?: string }> {
    // In trust mode, perform minimal checks
    if (this.config.mode === 'trust') {
      return this.trustCheck(command, cwd)
    }

    // In readonly mode, only allow read commands
    if (this.config.mode === 'readonly') {
      const readonlyCommands = ['cat', 'grep', 'ls', 'find', 'head', 'tail', 'wc', 'sort', 'uniq']
      const isReadonly = readonlyCommands.some(cmd => 
        command.trim().startsWith(cmd)
      )
      
      if (!isReadonly) {
        return { allowed: false, reason: 'Only readonly commands allowed in readonly mode' }
      }
    }

    // Sandbox mode: full security check
    return this.sandboxCheck(command, cwd)
  }

  /**
   * Trust mode checks (minimal)
   */
  private async trustCheck(command: string, cwd?: string): Promise<{ allowed: boolean; reason?: string }> {
    // Check approval requirement
    if (this.trustConfig.requireApproval && this.trustConfig.approvalCallback) {
      const approved = await this.trustConfig.approvalCallback(command)
      if (!approved) {
        return { allowed: false, reason: 'Command requires manual approval' }
      }
    }

    // Check command whitelist
    if (this.trustConfig.allowedCommands && !this.trustConfig.allowedCommands.includes('*')) {
      const cmdName = command.trim().split(/\s+/)[0]
      if (!this.trustConfig.allowedCommands.includes(cmdName)) {
        return { allowed: false, reason: `Command "${cmdName}" not in allowed list` }
      }
    }

    // Check command blacklist
    if (this.trustConfig.blockedCommands) {
      for (const blocked of this.trustConfig.blockedCommands) {
        if (command.includes(blocked)) {
          return { allowed: false, reason: `Command contains blocked pattern: ${blocked}` }
        }
      }
    }

    // Check path whitelist
    if (cwd && this.trustConfig.allowedPaths && !this.trustConfig.allowedPaths.includes('*')) {
      const allowed = this.trustConfig.allowedPaths.some(path => 
        cwd.startsWith(path)
      )
      if (!allowed) {
        return { allowed: false, reason: `Working directory "${cwd}" not in allowed paths` }
      }
    }

    // Check path blacklist
    if (cwd && this.trustConfig.blockedPaths) {
      for (const blocked of this.trustConfig.blockedPaths) {
        if (cwd.startsWith(blocked)) {
          return { allowed: false, reason: `Working directory "${cwd}" is blocked` }
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Sandbox mode checks (strict)
   */
  private sandboxCheck(command: string, cwd?: string): Promise<{ allowed: boolean; reason?: string }> {
    // Check dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return { 
          allowed: false, 
          reason: `Dangerous pattern detected: ${pattern.source}` 
        }
      }
    }

    // Trust mode checks
    const trustResult = this.trustCheck(command, cwd)
    return trustResult
  }

  /**
   * Enable/disable trust mode
   */
  setTrustMode(enabled: boolean, config?: Partial<TrustConfig>): void {
    this.trustConfig.enabled = enabled
    if (config) {
      Object.assign(this.trustConfig, config)
    }
    logger.info('Trust mode changed', { enabled, config: this.trustConfig })
  }

  /**
   * Get execution history
   */
  getHistory(limit = 100): ShellResult[] {
    return this.executionHistory.slice(-limit)
  }

  /**
   * Get blocked history
   */
  getBlockedHistory(): BlockedCommand[] {
    return [...this.blockedHistory]
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.executionHistory = []
    this.blockedHistory = []
  }

  /**
   * Subscribe to shell events
   */
  on(event: 'command:completed' | 'command:failed' | 'command:blocked', 
      handler: (event: { type: string; command?: string; result?: ShellResult; reason?: string }) => void): void {
    this.emitter.on(event, handler)
  }

  /**
   * Emit event
   */
  private emit(event: { type: string; command?: string; result?: ShellResult; reason?: string }): void {
    this.emitter.emit(event.type, {
      ...event,
      timestamp: new Date()
    })
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    blockedExecutions: number
    mode: ShellMode
    trustEnabled: boolean
  } {
    return {
      totalExecutions: this.executionHistory.length,
      successfulExecutions: this.executionHistory.filter(r => r.success).length,
      failedExecutions: this.executionHistory.filter(r => !r.success).length,
      blockedExecutions: this.blockedHistory.length,
      mode: this.config.mode,
      trustEnabled: this.trustConfig.enabled
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a sandboxed shell executor
 */
export function createSandboxExecutor(): ShellExecutor {
  return new ShellExecutor({ mode: 'sandbox' })
}

/**
 * Create a trusted shell executor (for development/automation)
 */
export function createTrustedExecutor(config?: {
  allowedCommands?: string[]
  allowedPaths?: string[]
  requireApproval?: boolean
}): ShellExecutor {
  return new ShellExecutor(
    { mode: 'trust' },
    {
      enabled: true,
      allowedCommands: config?.allowedCommands ?? ['*'],
      allowedPaths: config?.allowedPaths ?? ['*'],
      requireApproval: config?.requireApproval ?? false
    }
  )
}

/**
 * Create a readonly shell executor (for analysis)
 */
export function createReadonlyExecutor(): ShellExecutor {
  return new ShellExecutor({ mode: 'readonly' })
}

// ============================================================================
// Singleton
// ============================================================================

let shellExecutorInstance: ShellExecutor | null = null

export function getShellExecutor(): ShellExecutor {
  if (!shellExecutorInstance) {
    shellExecutorInstance = new ShellExecutor()
  }
  return shellExecutorInstance
}
