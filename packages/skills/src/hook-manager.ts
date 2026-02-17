import { createModuleLogger, getEventEmitter, type EventType } from '@wqbot/core'
import { getHookLoader } from './hook-loader.js'
import type { Hook, HookContext, HookResult, HookEvent, HookAction } from './hook-types.js'

const logger = createModuleLogger('hook-manager')

/**
 * Hook execution result with all hooks that were triggered
 */
export interface HookExecutionResult {
  /** Final action after all hooks */
  action: HookAction
  /** Modified args if any hook modified them */
  modifiedArgs?: Record<string, unknown>
  /** Messages from hooks */
  messages: string[]
  /** Hooks that were triggered */
  triggeredHooks: string[]
}

/**
 * Hook manager - loads, registers, and executes hooks
 */
export class HookManager {
  private readonly hooks: Map<string, Hook> = new Map()
  private initialized = false

  /**
   * Initialize and load all hooks
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    const loader = getHookLoader()
    const loadedHooks = await loader.loadAll()

    this.hooks.clear()
    for (const hook of loadedHooks) {
      if (hook.enabled) {
        this.hooks.set(hook.id, hook)
      }
    }

    // Register built-in hooks
    await this.registerBuiltinHooks()

    // Subscribe to events
    this.subscribeToEvents()

    this.initialized = true
    logger.info(`Hook manager initialized: ${this.hooks.size} hooks`)
  }

  /**
   * Register built-in hooks
   */
  private async registerBuiltinHooks(): Promise<void> {
    // Security check hook for tool:before
    const securityHook = this.createSecurityHook()
    this.hooks.set('builtin:security-check', securityHook)

    // Prompt injection check for prompt:submit
    const promptInjectionHook = this.createPromptInjectionHook()
    this.hooks.set('builtin:prompt-injection', promptInjectionHook)
  }

  /**
   * Create security check hook
   */
  private createSecurityHook(): Hook {
    return {
      id: 'builtin:security-check',
      name: 'security-check',
      description: 'Checks for dangerous patterns in tool arguments',
      event: 'tool:before',
      enabled: true,
      priority: 100, // High priority
      action: 'allow',
      source: 'builtin',
      tools: ['bash', 'edit', 'write'],
      compiledPatterns: [
        /rm\s+-rf\s+\//i,
        />\s*\/dev\/[sh]d/i,
        /curl\s+.*\|\s*(ba)?sh/i,
        /wget\s+.*\|\s*(ba)?sh/i,
        /eval\s*\(/i,
      ],
    }
  }

  /**
   * Create prompt injection check hook
   */
  private createPromptInjectionHook(): Hook {
    return {
      id: 'builtin:prompt-injection',
      name: 'prompt-injection-check',
      description: 'Checks for prompt injection patterns in user input',
      event: 'prompt:submit',
      enabled: true,
      priority: 100,
      action: 'warn',
      source: 'builtin',
      compiledPatterns: [
        /ignore\s+(all\s+)?(previous|above)\s+instructions?/gi,
        /disregard\s+(all\s+)?(previous|above)\s+instructions?/gi,
        /you\s+are\s+now\s+/gi,
      ],
    }
  }

  /**
   * Subscribe to system events
   */
  private subscribeToEvents(): void {
    const emitter = getEventEmitter()

    // Map system events to hook events
    const eventMapping: Record<EventType, HookEvent | null> = {
      'tool:before': 'tool:before',
      'tool:after': 'tool:after',
      'session:start': 'session:start',
      'session:stop': 'session:stop',
      'prompt:submit': 'prompt:submit',
      // Other events not mapped to hooks
      'conversation:start': null,
      'conversation:end': null,
      'message:received': null,
      'message:sent': null,
      'skill:execute': null,
      'skill:complete': null,
      'model:request': null,
      'model:response': null,
      'config:change': null,
      'error': null,
    }

    for (const [eventType, hookEvent] of Object.entries(eventMapping)) {
      if (hookEvent) {
        emitter.on(eventType as EventType, async (event) => {
          await this.executeHooks(hookEvent, {
            event: hookEvent,
            timestamp: event.timestamp,
            ...event.data as Record<string, unknown>,
          })
        })
      }
    }
  }

  /**
   * Execute hooks for an event
   */
  async executeHooks(event: HookEvent, context: Partial<HookContext>): Promise<HookExecutionResult> {
    const fullContext: HookContext = {
      event,
      timestamp: new Date(),
      ...context,
    }

    // Get matching hooks
    const matchingHooks = this.getMatchingHooks(event, context.tool)
    
    // Sort by priority (higher first)
    matchingHooks.sort((a, b) => b.priority - a.priority)

    const messages: string[] = []
    const triggeredHooks: string[] = []
    let currentAction: HookAction = 'allow'
    let modifiedArgs = context.args ? { ...context.args } : undefined

    for (const hook of matchingHooks) {
      const result = await this.executeHook(hook, fullContext)
      
      if (result) {
        triggeredHooks.push(hook.name)

        if (result.message) {
          messages.push(`[${hook.name}] ${result.message}`)
        }

        // Handle modify action
        if (result.action === 'modify' && result.modifiedArgs) {
          modifiedArgs = { ...modifiedArgs, ...result.modifiedArgs }
        }

        // Handle block action
        if (result.action === 'block') {
          currentAction = 'block'
          logger.warn(`Hook blocked: ${hook.name}`, { context: fullContext })
          break // Stop executing on block
        }

        // Handle warn action
        if (result.action === 'warn' && currentAction !== 'block') {
          currentAction = 'warn'
        }
      }
    }

    if (triggeredHooks.length > 0) {
      logger.debug(`Executed ${triggeredHooks.length} hooks for ${event}`, {
        hooks: triggeredHooks,
        action: currentAction,
      })
    }

    return {
      action: currentAction,
      modifiedArgs,
      messages,
      triggeredHooks,
    }
  }

  /**
   * Get hooks matching an event and optional tool
   */
  private getMatchingHooks(event: HookEvent, tool?: string): Hook[] {
    return [...this.hooks.values()].filter(hook => {
      if (!hook.enabled) return false
      if (hook.event !== event) return false

      // Check tool filter
      if (hook.tools && hook.tools.length > 0) {
        if (!tool || !hook.tools.includes(tool)) {
          return false
        }
      }

      return true
    })
  }

  /**
   * Execute a single hook
   */
  private async executeHook(hook: Hook, context: HookContext): Promise<HookResult | null> {
    // Check pattern matching
    if (hook.compiledPatterns && hook.compiledPatterns.length > 0) {
      const inputToCheck = context.input ?? 
        (context.args ? JSON.stringify(context.args) : '')
      
      const matched = hook.compiledPatterns.some(pattern => pattern.test(inputToCheck))
      
      if (!matched) {
        return null // Pattern didn't match, don't trigger
      }

      // Pattern matched
      return {
        action: hook.action,
        message: hook.action === 'block' 
          ? `Blocked by pattern match in ${hook.name}`
          : hook.action === 'warn'
            ? `Warning from ${hook.name}: pattern matched`
            : undefined,
      }
    }

    // Check custom handler
    if (hook.handler) {
      try {
        return await hook.handler(context)
      } catch (error) {
        logger.error(`Hook handler error: ${hook.name}`, error instanceof Error ? error : undefined)
        return null
      }
    }

    // No patterns or handler - always trigger with configured action
    return {
      action: hook.action,
    }
  }

  /**
   * Register a custom hook
   */
  registerHook(hook: Hook): void {
    this.hooks.set(hook.id, hook)
    logger.debug(`Registered hook: ${hook.name}`)
  }

  /**
   * Unregister a hook
   */
  unregisterHook(id: string): boolean {
    const deleted = this.hooks.delete(id)
    if (deleted) {
      logger.debug(`Unregistered hook: ${id}`)
    }
    return deleted
  }

  /**
   * Get all hooks
   */
  getAll(): readonly Hook[] {
    return [...this.hooks.values()]
  }

  /**
   * Get hooks by event
   */
  getByEvent(event: HookEvent): readonly Hook[] {
    return [...this.hooks.values()].filter(h => h.event === event)
  }

  /**
   * Reload all hooks
   */
  async reload(): Promise<void> {
    this.hooks.clear()
    this.initialized = false
    await this.initialize()
    logger.info('Hooks reloaded')
  }

  /**
   * Enable/disable a hook
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const hook = this.hooks.get(id)
    if (hook) {
      this.hooks.set(id, { ...hook, enabled })
      logger.debug(`Hook ${id} ${enabled ? 'enabled' : 'disabled'}`)
      return true
    }
    return false
  }
}

// Singleton
let managerInstance: HookManager | null = null

export function getHookManager(): HookManager {
  if (!managerInstance) {
    managerInstance = new HookManager()
  }
  return managerInstance
}

export async function initializeHookManager(): Promise<HookManager> {
  const manager = getHookManager()
  await manager.initialize()
  return manager
}
