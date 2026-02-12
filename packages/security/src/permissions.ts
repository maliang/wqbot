import type { Permission } from '@wqbot/core'
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

export class PermissionManager {
  private readonly grants: Map<string, PermissionGrant[]> = new Map()
  private readonly globalGrants: Set<Permission> = new Set()
  private permissionCallback: PermissionCallback | null = null

  /**
   * Set a callback for permission requests
   */
  setPermissionCallback(callback: PermissionCallback): void {
    this.permissionCallback = callback
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
