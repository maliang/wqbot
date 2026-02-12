import type { EventType, EventHandler, SystemEvent } from './types.js'
import { createModuleLogger } from './logger.js'

const logger = createModuleLogger('events')

export class EventEmitter {
  private readonly handlers: Map<EventType, Set<EventHandler>> = new Map()
  private readonly allHandlers: Set<EventHandler> = new Set()

  on(eventType: EventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler)
    }
  }

  onAll(handler: EventHandler): () => void {
    this.allHandlers.add(handler)
    return () => {
      this.allHandlers.delete(handler)
    }
  }

  off(eventType: EventType, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler)
  }

  async emit(eventType: EventType, data: Record<string, unknown> = {}): Promise<void> {
    const event: SystemEvent = {
      type: eventType,
      timestamp: new Date(),
      data,
    }

    logger.debug(`Emitting event: ${eventType}`, { eventType, data })

    const typeHandlers = this.handlers.get(eventType) ?? new Set()
    const allHandlersToCall = [...typeHandlers, ...this.allHandlers]

    const results = await Promise.allSettled(allHandlersToCall.map((handler) => handler(event)))

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Event handler failed', result.reason as Error, { eventType })
      }
    }
  }

  clear(): void {
    this.handlers.clear()
    this.allHandlers.clear()
  }
}

// Global event emitter instance
let globalEmitter: EventEmitter | null = null

export function getEventEmitter(): EventEmitter {
  if (!globalEmitter) {
    globalEmitter = new EventEmitter()
  }
  return globalEmitter
}

// Convenience functions
export function on(eventType: EventType, handler: EventHandler): () => void {
  return getEventEmitter().on(eventType, handler)
}

export function emit(eventType: EventType, data?: Record<string, unknown>): Promise<void> {
  return getEventEmitter().emit(eventType, data)
}
