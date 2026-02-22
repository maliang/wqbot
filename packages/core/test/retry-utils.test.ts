import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the logger module
vi.mock('../src/logger.js', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import {
  retryWithBackoff,
  retryWithResult,
  processBatch,
  CircuitBreaker,
  withFallback,
  withTimeout,
} from '../src/retry-utils.js'

describe('retryWithBackoff', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await retryWithBackoff(fn)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('success')

    const result = await retryWithBackoff(fn, { maxAttempts: 3, initialDelay: 10 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))

    await expect(retryWithBackoff(fn, { maxAttempts: 3, initialDelay: 10 })).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respects isRetryable predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('non-retryable'))
    const isRetryable = vi.fn().mockReturnValue(false)

    await expect(retryWithBackoff(fn, { maxAttempts: 3, initialDelay: 10, isRetryable })).rejects.toThrow('non-retryable')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('calls onRetry callback', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success')
    const onRetry = vi.fn()

    await retryWithBackoff(fn, { maxAttempts: 3, initialDelay: 10, onRetry })

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number))
  })
})

describe('retryWithResult', () => {
  it('returns success result', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await retryWithResult(fn)

    expect(result.success).toBe(true)
    expect(result.result).toBe('success')
    expect(result.attempts).toBe(1)
  })

  it('returns failure result after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    const result = await retryWithResult(fn, { maxAttempts: 3, initialDelay: 10 })

    expect(result.success).toBe(false)
    expect(result.error!.message).toBe('always fails')
    expect(result.attempts).toBe(3)
  })

  it('includes total time', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await retryWithResult(fn)

    expect(result.totalTime).toBeGreaterThanOrEqual(0)
  })
})

describe('processBatch', () => {
  it('processes items in batch', async () => {
    const items = [1, 2, 3, 4, 5]
    const processor = async (item: number) => item * 2

    const result = await processBatch(items, processor, { batchSize: 2 })

    expect(result.successful.length).toBe(5)
    expect(result.failed.length).toBe(0)
    expect(result.totalProcessed).toBe(5)
    expect(result.successRate).toBe(1)
  })

  it('handles failures with continueOnError', async () => {
    const items = [1, 2, 3]
    const processor = async (item: number) => {
      if (item === 2) throw new Error('fail')
      return item * 2
    }

    const result = await processBatch(items, processor, { continueOnError: true })

    expect(result.successful.length).toBe(2)
    expect(result.failed.length).toBe(1)
    expect(result.failed[0]!.input).toBe(2)
  })

  it('stops on error when continueOnError is false', async () => {
    const items = [1, 2, 3, 4, 5]
    const processor = async (item: number) => {
      if (item === 2) throw new Error('fail')
      return item * 2
    }

    const result = await processBatch(items, processor, { batchSize: 1, continueOnError: false })

    expect(result.totalProcessed).toBeLessThan(5)
  })

  it('calls onError callback', async () => {
    const items = [1, 2]
    const processor = async (item: number) => {
      if (item === 2) throw new Error('fail')
      return item
    }
    const onError = vi.fn()

    await processBatch(items, processor, { onError })

    expect(onError).toHaveBeenCalledWith(expect.any(Error), 2, 1)
  })

  it('handles empty array', async () => {
    const result = await processBatch([], async (x) => x)
    expect(result.totalProcessed).toBe(0)
  })
})

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 100,
    })
  })

  it('executes function when closed', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await circuitBreaker.execute(fn)

    expect(result).toBe('success')
    expect(circuitBreaker.getState()).toBe('closed')
  })

  it('opens after failure threshold', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(fn)
      } catch {}
    }

    expect(circuitBreaker.getState()).toBe('open')
  })

  it('rejects immediately when open', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    // Trigger open state
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(fn)
      } catch {}
    }

    // Should reject immediately
    await expect(circuitBreaker.execute(vi.fn().mockResolvedValue('success'))).rejects.toThrow('Circuit breaker is open')
  })

  it('transitions to half-open after reset timeout', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    // Trigger open state
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(fn)
      } catch {}
    }

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 150))

    // Should transition to half-open and execute
    const successFn = vi.fn().mockResolvedValue('success')
    await circuitBreaker.execute(successFn)
    expect(successFn).toHaveBeenCalled()
  })

  it('closes after success threshold in half-open', async () => {
    const failFn = vi.fn().mockRejectedValue(new Error('fail'))

    // Trigger open state
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(failFn)
      } catch {}
    }

    // Wait for reset timeout
    await new Promise(resolve => setTimeout(resolve, 150))

    // Success in half-open
    const successFn = vi.fn().mockResolvedValue('success')
    await circuitBreaker.execute(successFn)
    await circuitBreaker.execute(successFn)

    expect(circuitBreaker.getState()).toBe('closed')
  })

  it('resets to closed state', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))

    // Trigger open state
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(fn)
      } catch {}
    }

    circuitBreaker.reset()
    expect(circuitBreaker.getState()).toBe('closed')
  })
})

describe('withFallback', () => {
  it('returns primary result on success', async () => {
    const primary = vi.fn().mockResolvedValue('primary')
    const fallback = vi.fn().mockResolvedValue('fallback')

    const result = await withFallback(primary, fallback)

    expect(result).toBe('primary')
    expect(fallback).not.toHaveBeenCalled()
  })

  it('uses fallback on primary failure', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('primary fail'))
    const fallback = vi.fn().mockResolvedValue('fallback')

    const result = await withFallback(primary, fallback)

    expect(result).toBe('fallback')
    expect(fallback).toHaveBeenCalled()
  })

  it('respects shouldFallback predicate', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('non-retryable'))
    const fallback = vi.fn().mockResolvedValue('fallback')
    const shouldFallback = vi.fn().mockReturnValue(false)

    await expect(withFallback(primary, fallback, { shouldFallback })).rejects.toThrow('non-retryable')
    expect(fallback).not.toHaveBeenCalled()
  })
})

describe('withTimeout', () => {
  it('returns result before timeout', async () => {
    const fn = vi.fn().mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve('success'), 50))
    )

    const result = await withTimeout(fn, 1000)
    expect(result).toBe('success')
  })

  it('throws on timeout', async () => {
    const fn = vi.fn().mockImplementation(() =>
      new Promise(resolve => setTimeout(resolve, 1000))
    )

    await expect(withTimeout(fn, 50, 'Custom timeout')).rejects.toThrow('Custom timeout')
  })
})
