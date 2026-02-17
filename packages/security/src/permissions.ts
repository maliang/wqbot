import type { Permission, PermissionMode, PermissionCheckResult, ToolPermissionRule } from '@wqbot/core'
import { createModuleLogger } from '@wqbot/core'

const logger = createModuleLogger('permissions')

interface PermissionGrant {
  readonly permission: Permission
  readonly skillName: string
  readonly grantedAt: Date
  readonly grantedBy?: string | undefined
  readonly expiresAt?: Date | undefined
}

interface PermissionRequest {
  readonly skillName: string
  readonly permissions: readonly Permission[]
  readonly reason?: string | undefined
}

type PermissionCallback = (request: PermissionRequest) => Promise<boolean>

// Tool permission grant with mode
interface ToolPermissionGrant {
  readonly tool: string
  readonly mode: PermissionMode
  readonly source: string // skill or agent name
  readonly grantedAt: Date
  readonly conditions?: Record<string, unknown>
}

// Ask callback for interactive permission requests
type AskCallback = (tool: string, reason?: string) => Promise<boolean>

export class PermissionManager {
  private readonly grants: Map<string, PermissionGrant[]> = new Map()
  private readonly globalGrants: Set<Permission> = new Set()
  private permissionCallback: PermissionCallback | null = null

  // Tool-level permissions
  private readonly toolGrants: Map<string, PermissionMode> = new Map()
  private readonly toolAskCallback: AskCallback | null = null
  private readonly defaultToolMode: PermissionMode = 'ask'

  /**
   * Set a callback for permission requests
   */
  setPermissionCallback(callback: PermissionCallback): void {
    this.permissionCallback = callback
  }

  /**
   * Set a callback for tool-level ask mode
   */
  setToolAskCallback(callback: AskCallback): void {
    ;(this as { toolAskCallback: AskCallback | null }).toolAskCallback = callback
  }

  /**
   * Set default tool permission mode
   */
  setDefaultToolMode(mode: PermissionMode): void {
    this.defaultToolMode = mode
    logger.debug('Default tool mode set', { mode })
  }

  /**
   * Grant a permission to a skill
   */
  grant(skillName: string, permission: Permission, options?: { expiresAt?: Date; grantedBy?: string }): void {
    const key = this.getKey(skillName)
    const existing = this.grants.get(key) ?? []

    // Check if already granted
    if (existing.some((g) => g.permission === permission)) {
      return
    }

    const grant: PermissionGrant = {
      permission,
      skillName,
      grantedAt: new Date(),
      grantedBy: options?.grantedBy,
      expiresAt: options?.expiresAt,
    }

    this.grants.set(key, [...existing, grant])
    logger.debug('Permission granted', { skillName, permission })
  }

  /**
   * Grant multiple permissions to a skill
   */
  grantMany(skillName: string, permissions: readonly Permission[], options?: { expiresAt?: Date; grantedBy?: string }): void {
    for (const permission of permissions) {
      this.grant(skillName, permission, options)
    }
  }

  /**
   * Revoke a permission from a skill
   */
  revoke(skillName: string, permission: Permission): void {
    const key = this.getKey(skillName)
    const existing = this.grants.get(key) ?? []
    const filtered = existing.filter((g) => g.permission !== permission)

    if (filtered.length === 0) {
      this.grants.delete(key)
    } else {
      this.grants.set(key, filtered)
    }

    logger.debug('Permission revoked', { skillName, permission })
  }

  /**
   * Revoke all permissions from a skill
   */
  revokeAll(skillName: string): void {
    const key = this.getKey(skillName)
    this.grants.delete(key)
    logger.debug('All permissions revoked', { skillName })
  }

  /**
   * Check if a skill has a permission
   */
  hasPermission(skillName: string, permission: Permission): boolean {
    // Check global grants first
    if (this.globalGrants.has(permission)) {
      return true
    }

    const key = this.getKey(skillName)
    const grants = this.grants.get(key) ?? []

    const grant = grants.find((g) => g.permission === permission)
    if (!grant) {
      return false
    }

    // Check expiration
    if (grant.expiresAt && grant.expiresAt < new Date()) {
      this.revoke(skillName, permission)
      return false
    }

    return true
  }

  /**
   * Check if a skill has all required permissions
   */
  hasAllPermissions(skillName: string, permissions: readonly Permission[]): boolean {
    return permissions.every((p) => this.hasPermission(skillName, p))
  }

  /**
   * Get all permissions for a skill
   */
  getPermissions(skillName: string): readonly Permission[] {
    const key = this.getKey(skillName)
    const grants = this.grants.get(key) ?? []

    // Filter out expired grants
    const validGrants = grants.filter((g) => {
      if (g.expiresAt && g.expiresAt < new Date()) {
        return false
      }
      return true
    })

    return [...new Set([...this.globalGrants, ...validGrants.map((g) => g.permission)])]
  }

  /**
   * Request permissions for a skill (interactive)
   */
  async requestPermissions(request: PermissionRequest): Promise<boolean> {
    const { skillName, permissions, reason } = request

    // Check if all permissions are already granted
    if (this.hasAllPermissions(skillName, permissions)) {
      return true
    }

    // Get missing permissions
    const missing = permissions.filter((p) => !this.hasPermission(skillName, p))

    if (missing.length === 0) {
      return true
    }

    // If no callback, deny by default
    if (!this.permissionCallback) {
      logger.warn('Permission request denied (no callback)', { skillName, missing })
      return false
    }

    // Request permission from user
    const granted = await this.permissionCallback({
      skillName,
      permissions: missing,
      reason,
    })

    if (granted) {
      this.grantMany(skillName, missing)
      logger.info('Permissions granted by user', { skillName, permissions: missing })
    } else {
      logger.info('Permissions denied by user', { skillName, permissions: missing })
    }

    return granted
  }

  /**
   * Grant a permission globally (to all skills)
   */
  grantGlobal(permission: Permission): void {
    this.globalGrants.add(permission)
    logger.debug('Global permission granted', { permission })
  }

  /**
   * Revoke a global permission
   */
  revokeGlobal(permission: Permission): void {
    this.globalGrants.delete(permission)
    logger.debug('Global permission revoked', { permission })
  }

  /**
   * Get all global permissions
   */
  getGlobalPermissions(): readonly Permission[] {
    return [...this.globalGrants]
  }

  /**
   * Clear all grants (useful for testing)
   */
  clearAll(): void {
    this.grants.clear()
    this.globalGrants.clear()
    this.toolGrants.clear()
  }

  // ===== Tool-level Permission Methods (Claude Code style) =====

  /**
   * Set permission mode for a specific tool
   */
  setToolMode(tool: string, mode: PermissionMode): void {
    this.toolGrants.set(tool.toLowerCase(), mode)
    logger.debug('Tool permission mode set', { tool, mode })
  }

  /**
   * Set permission modes for multiple tools
   */
  setToolModes(rules: readonly ToolPermissionRule[]): void {
    for (const rule of rules) {
      this.setToolMode(rule.tool, rule.mode)
    }
  }

  /**
   * Get permission mode for a tool
   */
  getToolMode(tool: string): PermissionMode {
    return this.toolGrants.get(tool.toLowerCase()) ?? this.defaultToolMode
  }

  /**
   * Check if a tool can be used (returns detailed result)
   */
  async checkToolPermission(tool: string, reason?: string): Promise<PermissionCheckResult> {
    const mode = this.getToolMode(tool)

    switch (mode) {
      case 'allow':
        return { allowed: true, mode: 'allow', shouldAsk: false }

      case 'deny':
        logger.warn('Tool denied by permission rule', { tool })
        return {
          allowed: false,
          mode: 'deny',
          reason: `Tool "${tool}" is denied by permission rules`,
          shouldAsk: false,
        }

      case 'ask':
        // If no ask callback, use default mode
        if (!this.toolAskCallback) {
          logger.debug('No ask callback, using default mode', { tool, defaultMode: this.defaultToolMode })
          return {
            allowed: this.defaultToolMode === 'allow',
            mode: this.defaultToolMode,
            reason: 'No permission callback configured',
            shouldAsk: true,
          }
        }

        // Ask user for permission
        const granted = await this.toolAskCallback(tool, reason)

        if (granted) {
          // Cache the decision for this session
          this.setToolMode(tool, 'allow')
          logger.info('Tool permission granted by user', { tool })
          return { allowed: true, mode: 'allow', shouldAsk: true }
        } else {
          logger.info('Tool permission denied by user', { tool })
          return {
            allowed: false,
            mode: 'deny',
            reason: 'User denied permission',
            shouldAsk: true,
          }
        }
    }
  }

  /**
   * Quick check if a tool is allowed (synchronous, for simple cases)
   */
  isToolAllowed(tool: string): boolean {
    const mode = this.getToolMode(tool)
    return mode === 'allow'
  }

  /**
   * Get all tool permission rules
   */
  getToolRules(): readonly { tool: string; mode: PermissionMode }[] {
    return [...this.toolGrants.entries()].map(([tool, mode]) => ({ tool, mode }))
  }

  /**
   * Export tool grants for persistence
   */
  exportToolGrants(): Record<string, PermissionMode> {
    const result: Record<string, PermissionMode> = {}
    for (const [tool, mode] of this.toolGrants) {
      result[tool] = mode
    }
    return result
  }

  /**
   * Import tool grants from persistence
   */
  importToolGrants(data: Record<string, PermissionMode>): void {
    for (const [tool, mode] of Object.entries(data)) {
      this.toolGrants.set(tool, mode)
    }
  }

  private getKey(skillName: string): string {
    return skillName.toLowerCase()
  }

  /**
   * Export grants for persistence
   */
  exportGrants(): Record<string, PermissionGrant[]> {
    const result: Record<string, PermissionGrant[]> = {}
    for (const [key, grants] of this.grants) {
      result[key] = grants
    }
    return result
  }

  /**
   * Import grants from persistence
   */
  importGrants(data: Record<string, PermissionGrant[]>): void {
    for (const [key, grants] of Object.entries(data)) {
      this.grants.set(key, grants.map((g) => ({
        ...g,
        grantedAt: new Date(g.grantedAt),
        expiresAt: g.expiresAt ? new Date(g.expiresAt) : undefined,
      })))
    }
  }
}

// Singleton instance
let managerInstance: PermissionManager | null = null

export function getPermissionManager(): PermissionManager {
  if (!managerInstance) {
    managerInstance = new PermissionManager()
  }
  return managerInstance
}

export function initializePermissionManager(): PermissionManager {
  return getPermissionManager()
}
