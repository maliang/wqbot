import { describe, it, expect, vi } from 'vitest'

// mock 掉依赖链避免 bun:sqlite
vi.mock('@wqbot/storage', () => ({
  getDatabase: vi.fn(),
}))
vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
  generateId: () => 'mock-id',
}))

import { cosineSimilarity, rrfFusion } from './search.js'

describe('cosineSimilarity', () => {
  it('相同向量返回 1', () => {
    const v = new Float32Array([1, 2, 3])
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })

  it('正交向量返回 0', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([0, 1])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5)
  })

  it('反向向量返回 -1', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([-1, -2, -3])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5)
  })

  it('零向量返回 0（除零保护）', () => {
    const zero = new Float32Array([0, 0, 0])
    const v = new Float32Array([1, 2, 3])
    expect(cosineSimilarity(zero, v)).toBe(0)
    expect(cosineSimilarity(v, zero)).toBe(0)
    expect(cosineSimilarity(zero, zero)).toBe(0)
  })

  it('不同大小的同方向向量返回 1', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([2, 4, 6])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5)
  })
})

describe('rrfFusion', () => {
  it('单列表排序不变', () => {
    const list = [
      { id: 'a', score: 10 },
      { id: 'b', score: 5 },
    ]
    const result = rrfFusion([list])
    expect(result[0]!.id).toBe('a')
    expect(result[1]!.id).toBe('b')
    // RRF 分数：1/(60+0+1) = 1/61, 1/(60+1+1) = 1/62
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score)
  })

  it('多列表融合，交集项排名更高', () => {
    const list1 = [
      { id: 'a', score: 10 },
      { id: 'b', score: 5 },
    ]
    const list2 = [
      { id: 'b', score: 10 },
      { id: 'c', score: 5 },
    ]
    const result = rrfFusion([list1, list2])
    // 'b' 出现在两个列表中，应排名最高
    expect(result[0]!.id).toBe('b')
  })

  it('空列表返回空', () => {
    expect(rrfFusion([])).toEqual([])
    expect(rrfFusion([[]])).toEqual([])
  })

  it('不同 k 值影响分数计算', () => {
    const list = [
      { id: 'a', score: 10 },
      { id: 'b', score: 5 },
    ]
    const resultK1 = rrfFusion([list], 1)
    const resultK100 = rrfFusion([list], 100)

    // k=1: 1/(1+0+1)=0.5, 1/(1+1+1)=0.333 → 差值大
    // k=100: 1/(100+0+1)≈0.0099, 1/(100+1+1)≈0.0098 → 差值小
    const diffK1 = resultK1[0]!.score - resultK1[1]!.score
    const diffK100 = resultK100[0]!.score - resultK100[1]!.score
    expect(diffK1).toBeGreaterThan(diffK100)
  })

  it('所有项都获得正分数', () => {
    const list = [
      { id: 'x', score: 1 },
      { id: 'y', score: 2 },
    ]
    const result = rrfFusion([list])
    for (const item of result) {
      expect(item.score).toBeGreaterThan(0)
    }
  })
})
