import * as path from 'node:path'
import * as os from 'node:os'
import { getConfigManager, createModuleLogger } from '@wqbot/core'
import { getCommandParser } from './command-parser.js'

const logger = createModuleLogger('sandbox')

interface PathCheckResult {
  readonly allowed: boolean
  readonly reason?: string
}

interface CommandCheckResult {
  readonly allowed: boolean
  readonly reason?: string
  readonly sanitizedCommand?: string
}

export class Sandbox {
  private readonly allowedPaths: Set<string> = new Set()
  private readonly blockedPaths: Set<string> = new Set()
  private readonly blockedCommands: readonly string[]
  private readonly dangerousPatterns: readonly RegExp[]
  private enabled: boolean

  constructor() {
    const config = getConfigManager().getSandboxConfig()
    this.enabled = config.enabled

    // Initialize default allowed paths
    const homeDir = os.homedir()
    const defaultAllowed = [
      path.join(homeDir, 'Documents'),
      path.join(homeDir, 'Desktop'),
      path.join(homeDir, 'Downloads'),
      process.cwd(),
    ]

    for (const p of [...defaultAllowed, ...config.allowedPaths]) {
      this.allowedPaths.add(this.normalizePath(p))
    }

    // Initialize blocked paths
    const defaultBlocked = [
      '.ssh',
      '.env',
      'credentials',
      '.git/config',
      '.npmrc',
      '.pypirc',
      'id_rsa',
      'id_ed25519',
      '.aws/credentials',
      '.azure',
    ]

    for (const p of [...defaultBlocked, ...config.blockedPaths]) {
      this.blockedPaths.add(p.toLowerCase())
    }

    // Initialize blocked commands
    this.blockedCommands = [
      'rm -rf /',
      'rm -rf /*',
      'rm -rf ~',
      'rm -rf ~/*',
      'mkfs',
      'dd if=',
      ':(){:|:&};:',
      'chmod -R 777 /',
      'chown -R',
      '> /dev/sda',
      'curl | bash',
      'curl | sh',
      'wget | bash',
      'wget | sh',
      ...config.blockedCommands,
    ]

    // Dangerous command patterns
    this.dangerousPatterns = [
      /rm\s+(-[rf]+\s+)*\/(?!\w)/i, // rm -rf / or similar
      />\s*\/dev\/[sh]d[a-z]/i, // Writing to disk devices
      /mkfs\./i, // Formatting filesystems
      /dd\s+if=/i, // Direct disk operations
      /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i, // Fork bomb
      /curl\s+.*\|\s*(ba)?sh/i, // Piping curl to shell
      /wget\s+.*\|\s*(ba)?sh/i, // Piping wget to shell
      /eval\s*\$\(/i, // Eval with command substitution
      /`.*`/i, // Backtick command substitution (potential injection)
    ]
  }

  private normalizePath(p: string): string {
    return path.resolve(p).toLowerCase()
  }

  /**
   * Check if a file path is allowed
   */
  checkPath(filePath: string): PathCheckResult {
    if (!this.enabled) {
      return { allowed: true }
    }

    const normalizedPath = this.normalizePath(filePath)
    const pathLower = filePath.toLowerCase()

    // Check blocked paths (substring match)
    for (const blocked of this.blockedPaths) {
      if (pathLower.includes(blocked)) {
        logger.warn('Path blocked', { path: filePath, blockedPattern: blocked })
        return {
          allowed: false,
          reason: `Path contains blocked pattern: ${blocked}`,
        }
      }
    }

    // Check if path is within allowed directories
    let isAllowed = false
    for (const allowed of this.allowedPaths) {
      if (normalizedPath.startsWith(allowed)) {
        isAllowed = true
        break
      }
    }

    if (!isAllowed) {
      logger.warn('Path not in allowed directories', { path: filePath })
      return {
        allowed: false,
        reason: 'Path is not within allowed directories',
      }
    }

    return { allowed: true }
  }

  /**
   * Check if a command is allowed
   */
  checkCommand(command: string): CommandCheckResult {
    if (!this.enabled) {
      return { allowed: true, sanitizedCommand: command }
    }

    // 优先使用 AST 分析
    const parser = getCommandParser()
    const analysis = parser.analyze(command)

    if (!analysis.allowed) {
      const reasons = analysis.risks
        .filter((r) => r.level === 'critical' || r.level === 'high')
        .map((r) => r.description)
      logger.warn('Command blocked by AST analysis', { command, risks: reasons })
      return {
        allowed: false,
        reason: `安全风险: ${reasons.join('; ')}`,
      }
    }

    // Fallback: 正则检查（覆盖 AST 可能遗漏的模式）
    return this.checkCommandRegex(command)
  }

  /**
   * Regex-based command check (fallback)
   */
  private checkCommandRegex(command: string): CommandCheckResult {
    const commandLower = command.toLowerCase().trim()

    // Check exact blocked commands
    for (const blocked of this.blockedCommands) {
      if (commandLower.includes(blocked.toLowerCase())) {
        logger.warn('Command blocked', { command, blockedPattern: blocked })
        return {
          allowed: false,
          reason: `Command contains blocked pattern: ${blocked}`,
        }
      }
    }

    // Check dangerous patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(command)) {
        logger.warn('Command matches dangerous pattern', { command, pattern: pattern.source })
        return {
          allowed: false,
          reason: 'Command matches a dangerous pattern',
        }
      }
    }

    // Check for potential command injection
    const injectionPatterns = [
      /;\s*rm\s/i,
      /&&\s*rm\s/i,
      /\|\|\s*rm\s/i,
      /`[^`]*`/, // Backticks
      /\$\([^)]*\)/, // Command substitution
    ]

    for (const pattern of injectionPatterns) {
      if (pattern.test(command)) {
        logger.warn('Potential command injection detected', { command })
        return {
          allowed: false,
          reason: 'Potential command injection detected',
        }
      }
    }

    return { allowed: true, sanitizedCommand: command }
  }

  /**
   * Add a path to the allowed list
   */
  allowPath(filePath: string): void {
    const normalized = this.normalizePath(filePath)
    this.allowedPaths.add(normalized)
    logger.debug('Added allowed path', { path: filePath })
  }

  /**
   * Remove a path from the allowed list
   */
  disallowPath(filePath: string): void {
    const normalized = this.normalizePath(filePath)
    this.allowedPaths.delete(normalized)
    logger.debug('Removed allowed path', { path: filePath })
  }

  /**
   * Add a path to the blocked list
   */
  blockPath(pattern: string): void {
    this.blockedPaths.add(pattern.toLowerCase())
    logger.debug('Added blocked path pattern', { pattern })
  }

  /**
   * Enable or disable the sandbox
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    logger.info(`Sandbox ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Check if sandbox is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Get all allowed paths
   */
  getAllowedPaths(): readonly string[] {
    return [...this.allowedPaths]
  }

  /**
   * Get all blocked paths
   */
  getBlockedPaths(): readonly string[] {
    return [...this.blockedPaths]
  }
}

// Singleton instance
let sandboxInstance: Sandbox | null = null

export function getSandbox(): Sandbox {
  if (!sandboxInstance) {
    sandboxInstance = new Sandbox()
  }
  return sandboxInstance
}

export function initializeSandbox(): Sandbox {
  return getSandbox()
}
