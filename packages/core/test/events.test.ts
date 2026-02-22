import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the logger module
vi.mock('../src/logger.js', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { EventEmitter, getEventEmitter, on, emit } from '../src/events.js'

describe('EventEmitter', () => {
  let emitter: EventEmitter

  beforeEach(() => {
    emitter = new EventEmitter()
  })

  afterEach(() => {
    emitter.clear()
  })

  describe('on', () => {
    it('registers event handler', async () => {
      const handler = vi.fn()
      emitter.on('config:changed', handler)

      await emitter.emit('config:changed', { key: 'value' })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'config:changed',
          data: { key: 'value' },
        })
      )
    })

    it('returns unsubscribe function', async () => {
      const handler = vi.fn()
      const unsubscribe = emitter.on('config:changed', handler)

      unsubscribe()
      await emitter.emit('config:changed')

      expect(handler).not.toHaveBeenCalled()
    })

    it('supports multiple handlers for same event', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      emitter.on('config:changed', handler1)
      emitter.on('config:changed', handler2)

      await emitter.emit('config:changed')

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })
  })

  describe('onAll', () => {
    it('receives all events', async () => {
      const handler = vi.fn()
      emitter.onAll(handler)

      await emitter.emit('config:changed', { a: 1 })
      await emitter.emit('conversation:created', { b: 2 })

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('returns unsubscribe function', async () => {
      const handler = vi.fn()
      const unsubscribe = emitter.onAll(handler)

      unsubscribe()
      await emitter.emit('config:changed')

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('off', () => {
    it('removes event handler', async () => {
      const handler = vi.fn()
      emitter.on('config:changed', handler)
      emitter.off('config:changed', handler)

      await emitter.emit('config:changed')

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('emit', () => {
    it('includes timestamp in event', async () => {
      const handler = vi.fn()
      emitter.on('config:changed', handler)

      await emitter.emit('config:changed')

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        })
      )
    })

    it('handles handler errors gracefully', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'))
      const normalHandler = vi.fn()

      emitter.on('config:changed', errorHandler)
      emitter.on('config:changed', normalHandler)

      // Should not throw
      await emitter.emit('config:changed')

      // Both handlers should be called
      expect(errorHandler).toHaveBeenCalled()
      expect(normalHandler).toHaveBeenCalled()
    })
  })

  describe('clear', () => {
    it('removes all handlers', async () => {
      const handler = vi.fn()
      emitter.on('config:changed', handler)
      emitter.onAll(handler)

      emitter.clear()

      await emitter.emit('config:changed')

      expect(handler).not.toHaveBeenCalled()
    })
  })
})

describe('getEventEmitter', () => {
  it('returns singleton instance', () => {
    const instance1 = getEventEmitter()
    const instance2 = getEventEmitter()
    expect(instance1).toBe(instance2)
  })
})

describe('convenience functions', () => {
  it('on registers handler on global emitter', async () => {
    const handler = vi.fn()
    const unsubscribe = on('config:changed', handler)

    await emit('config:changed', { test: true })

    expect(handler).toHaveBeenCalled()
    unsubscribe()
  })

  it('emit emits on global emitter', async () => {
    const handler = vi.fn()
    getEventEmitter().on('conversation:created', handler)

    await emit('conversation:created', { id: '123' })

    expect(handler).toHaveBeenCalled()
  })
})
