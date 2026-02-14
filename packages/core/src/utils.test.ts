import { describe, it, expect, vi } from 'vitest'
import {
  generateId,
  truncate,
  deepClone,
  isObject,
  deepMerge,
  formatBytes,
  formatDuration,
  retry,
  pMap,
} from './utils.js'

describe('generateId', () => {
  it('返回字符串', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('带前缀', () => {
    const id = generateId('msg')
    expect(id).toMatch(/^msg_/)
  })
})

describe('truncate', () => {
  it('短字符串不截断', () => {
    expect(truncate('hi', 10)).toBe('hi')
  })

  it('长字符串截断加后缀', () => {
    expect(truncate('hello world', 5)).toBe('he...')
  })

  it('自定义后缀', () => {
    expect(truncate('hello', 3, '…')).toBe('he…')
  })
})

describe('deepClone', () => {
  it('深拷贝不共享引用', () => {
    const original = { a: 1, nested: { b: 2 } }
    const cloned = deepClone(original)
    cloned.nested.b = 99
    expect(original.nested.b).toBe(2)
  })
})

describe('isObject', () => {
  it('正确判断各类型', () => {
    expect(isObject({})).toBe(true)
    expect(isObject({ a: 1 })).toBe(true)
    expect(isObject(null)).toBe(false)
    expect(isObject([])).toBe(false)
    expect(isObject('string')).toBe(false)
    expect(isObject(42)).toBe(false)
  })
})

describe('deepMerge', () => {
  it('浅层合并', () => {
    const result = deepMerge({ a: 1 }, { b: 2 } as Record<string, unknown>)
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('深层递归合并', () => {
    const target = { nested: { a: 1, b: 2 } }
    const source = { nested: { b: 3, c: 4 } }
    const result = deepMerge(target, source as typeof target)
    expect(result).toEqual({ nested: { a: 1, b: 3, c: 4 } })
  })

  it('不修改原对象', () => {
    const target = { a: 1, nested: { b: 2 } }
    const source = { a: 10 }
    const result = deepMerge(target, source)
    expect(result.a).toBe(10)
    expect(target.a).toBe(1)
  })
})

describe('formatBytes', () => {
  it('各单位', () => {
    expect(formatBytes(0)).toBe('0.0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1048576)).toBe('1.0 MB')
  })
})

describe('formatDuration', () => {
  it('各区间', () => {
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(5000)).toBe('5s')
    expect(formatDuration(90000)).toBe('1m 30s')
    expect(formatDuration(3600000)).toBe('1h')
  })
})

describe('retry', () => {
  it('成功直接返回', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await retry(fn, { maxAttempts: 3, initialDelay: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('失败后重试成功', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok')
    const result = await retry(fn, { maxAttempts: 3, initialDelay: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('超过最大次数抛出', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fail'))
    await expect(retry(fn, { maxAttempts: 2, initialDelay: 1 })).rejects.toThrow('always fail')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('pMap', () => {
  it('并发执行结果顺序正确', async () => {
    const items = [1, 2, 3, 4]
    const result = await pMap(items, async (x) => x * 2, 2)
    expect(result).toEqual([2, 4, 6, 8])
  })

  it('空数组返回空数组', async () => {
    const result = await pMap([], async (x: number) => x, 2)
    expect(result).toEqual([])
  })
})
