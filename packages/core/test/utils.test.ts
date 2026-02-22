import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateId,
  sleep,
  retry,
  truncate,
  deepClone,
  isObject,
  deepMerge,
  formatBytes,
  formatDuration,
  debounce,
  throttle,
  createDeferred,
  pMap,
} from '../src/utils.js'

describe('generateId', () => {
  it('generates unique IDs', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })

  it('generates IDs with default length', () => {
    const id = generateId()
    expect(id.length).toBe(12)
  })

  it('generates IDs with prefix', () => {
    const id = generateId('user')
    expect(id.startsWith('user_')).toBe(true)
    expect(id.length).toBe(17) // 'user_' + 12 chars
  })
})

describe('sleep', () => {
  it('resolves after specified duration', async () => {
    const start = Date.now()
    await sleep(50)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40) // Allow some variance
  })
})

describe('retry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await retry(fn)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success')

    const result = await retry(fn, { maxAttempts: 3, initialDelay: 10 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))

    await expect(retry(fn, { maxAttempts: 3, initialDelay: 10 })).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respects backoff factor', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success')

    const start = Date.now()
    await retry(fn, { maxAttempts: 2, initialDelay: 50, backoffFactor: 2 })
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(40)
  })
})

describe('truncate', () => {
  it('returns original string if shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates with default suffix', () => {
    expect(truncate('hello world', 8)).toBe('hello...')
  })

  it('truncates with custom suffix', () => {
    expect(truncate('hello world', 10, '…')).toBe('hello wor…')
  })
})

describe('deepClone', () => {
  it('clones objects', () => {
    const obj = { a: 1, b: { c: 2 } }
    const clone = deepClone(obj)

    expect(clone).toEqual(obj)
    expect(clone).not.toBe(obj)
    expect(clone.b).not.toBe(obj.b)
  })

  it('clones arrays', () => {
    const arr = [1, { a: 2 }]
    const clone = deepClone(arr)

    expect(clone).toEqual(arr)
    expect(clone).not.toBe(arr)
  })
})

describe('isObject', () => {
  it('returns true for plain objects', () => {
    expect(isObject({})).toBe(true)
    expect(isObject({ a: 1 })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isObject(null)).toBe(false)
  })

  it('returns false for arrays', () => {
    expect(isObject([])).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isObject(123)).toBe(false)
    expect(isObject('string')).toBe(false)
    expect(isObject(true)).toBe(false)
  })
})

describe('deepMerge', () => {
  it('merges objects', () => {
    const target = { a: 1, b: { c: 2 } }
    const source = { b: { d: 3 }, e: 4 }
    const result = deepMerge(target, source)

    expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 })
  })

  it('does not mutate target', () => {
    const target = { a: 1 }
    const source = { b: 2 }
    deepMerge(target, source)

    expect(target).toEqual({ a: 1 })
  })

  it('overrides primitive values', () => {
    const target = { a: 1 }
    const source = { a: 2 }
    const result = deepMerge(target, source)

    expect(result.a).toBe(2)
  })

  it('ignores undefined values', () => {
    const target = { a: 1 }
    const source = { a: undefined, b: 2 }
    const result = deepMerge(target, source)

    expect(result.a).toBe(1)
    expect(result.b).toBe(2)
  })
})

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500.0 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB')
  })
})

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms')
  })

  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s')
  })

  it('formats minutes', () => {
    expect(formatDuration(60000)).toBe('1m')
    expect(formatDuration(90000)).toBe('1m 30s')
  })

  it('formats hours', () => {
    expect(formatDuration(3600000)).toBe('1h')
    expect(formatDuration(5400000)).toBe('1h 30m')
  })
})

describe('debounce', () => {
  it('debounces function calls', async () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 50)

    debounced()
    debounced()
    debounced()

    expect(fn).not.toHaveBeenCalled()

    await sleep(60)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('throttle', () => {
  it('throttles function calls', async () => {
    const fn = vi.fn()
    const throttled = throttle(fn, 50)

    throttled()
    throttled()
    throttled()

    expect(fn).toHaveBeenCalledTimes(1)

    await sleep(60)
    throttled()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('createDeferred', () => {
  it('creates a deferred promise', async () => {
    const { promise, resolve } = createDeferred<string>()

    resolve('done')
    const result = await promise

    expect(result).toBe('done')
  })

  it('supports rejection', async () => {
    const { promise, reject } = createDeferred<string>()

    reject(new Error('failed'))

    await expect(promise).rejects.toThrow('failed')
  })
})

describe('pMap', () => {
  it('maps with concurrency limit', async () => {
    const items = [1, 2, 3, 4, 5]
    const results: number[] = []

    const mapper = async (item: number) => {
      await sleep(10)
      results.push(item)
      return item * 2
    }

    const output = await pMap(items, mapper, 2)

    expect(output).toEqual([2, 4, 6, 8, 10])
  })

  it('handles empty array', async () => {
    const output = await pMap([], async (x) => x, 2)
    expect(output).toEqual([])
  })

  it('maintains order', async () => {
    const items = [3, 1, 2]
    const mapper = async (item: number) => {
      await sleep(item * 10)
      return item
    }

    const output = await pMap(items, mapper, 2)
    expect(output).toEqual([3, 1, 2])
  })
})
