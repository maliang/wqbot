import { describe, it, expect, vi } from 'vitest'

// mock 掉 @wqbot/storage 和 @wqbot/core 避免 bun:sqlite 依赖
vi.mock('@wqbot/storage', () => ({
  getDatabase: vi.fn(),
}))
vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
  generateId: () => 'mock-id',
}))

import { serializeEmbedding, deserializeEmbedding } from './database.js'

describe('serializeEmbedding / deserializeEmbedding', () => {
  it('往返序列化保持一致', () => {
    const original = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])
    const buffer = serializeEmbedding(original)
    const restored = deserializeEmbedding(buffer)
    expect(restored).toEqual(original)
  })

  it('128 维 embedding 正确往返', () => {
    const original = new Float32Array(128)
    for (let i = 0; i < 128; i++) {
      original[i] = Math.random() * 2 - 1
    }
    const restored = deserializeEmbedding(serializeEmbedding(original))
    expect(restored.length).toBe(128)
    for (let i = 0; i < 128; i++) {
      expect(restored[i]).toBe(original[i])
    }
  })

  it('384 维 embedding 正确往返', () => {
    const original = new Float32Array(384)
    for (let i = 0; i < 384; i++) {
      original[i] = (i - 192) / 192
    }
    const restored = deserializeEmbedding(serializeEmbedding(original))
    expect(restored).toEqual(original)
  })

  it('1536 维 embedding 正确往返', () => {
    const original = new Float32Array(1536)
    for (let i = 0; i < 1536; i++) {
      original[i] = Math.sin(i)
    }
    const restored = deserializeEmbedding(serializeEmbedding(original))
    expect(restored).toEqual(original)
  })

  it('空 Float32Array 正确往返', () => {
    const original = new Float32Array(0)
    const restored = deserializeEmbedding(serializeEmbedding(original))
    expect(restored.length).toBe(0)
  })

  it('特殊浮点值保持精度', () => {
    const original = new Float32Array([
      1e-38,   // 极小正数
      3.4e38,  // 接近 Float32 最大值
      -1e-38,  // 极小负数
      -3.4e38, // 接近 Float32 最小值
      0,       // 零
    ])
    const restored = deserializeEmbedding(serializeEmbedding(original))
    expect(restored).toEqual(original)
  })

  it('序列化结果是 Buffer 类型', () => {
    const embedding = new Float32Array([1, 2, 3])
    const buffer = serializeEmbedding(embedding)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    // Float32 每个元素 4 字节
    expect(buffer.length).toBe(3 * 4)
  })
})
