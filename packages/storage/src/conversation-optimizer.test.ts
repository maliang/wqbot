import { describe, it, expect, vi } from 'vitest'

vi.mock('@wqbot/core', () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { ConversationOptimizer, type OptimizerMessage } from './conversation-optimizer.js'

function makeMsg(id: string, role: 'user' | 'assistant', content: string): OptimizerMessage {
  return { id, role, content, timestamp: new Date() }
}

describe('ConversationOptimizer', () => {
  describe('estimateTokens', () => {
    const optimizer = new ConversationOptimizer()

    it('纯英文', () => {
      const tokens = optimizer.estimateTokens('hello world')
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(10)
    })

    it('纯中文', () => {
      const tokens = optimizer.estimateTokens('你好世界')
      expect(tokens).toBeGreaterThan(0)
      expect(tokens).toBeLessThan(10)
    })

    it('混合文本', () => {
      const tokens = optimizer.estimateTokens('hello 你好 world 世界')
      expect(tokens).toBeGreaterThan(0)
    })

    it('空字符串', () => {
      expect(optimizer.estimateTokens('')).toBe(0)
    })
  })

  describe('estimateMessagesTokens', () => {
    const optimizer = new ConversationOptimizer()

    it('累加多条消息', () => {
      const msgs = [
        makeMsg('1', 'user', 'hello'),
        makeMsg('2', 'assistant', 'world'),
      ]
      const total = optimizer.estimateMessagesTokens(msgs)
      expect(total).toBeGreaterThan(0)
      expect(total).toBe(
        optimizer.estimateTokens('hello') + optimizer.estimateTokens('world')
      )
    })
  })

  describe('pin/unpin/isPinned', () => {
    it('基本集合操作', () => {
      const optimizer = new ConversationOptimizer()
      expect(optimizer.isPinned('msg1')).toBe(false)
      optimizer.pinMessage('msg1')
      expect(optimizer.isPinned('msg1')).toBe(true)
      optimizer.unpinMessage('msg1')
      expect(optimizer.isPinned('msg1')).toBe(false)
    })
  })

  describe('updateConfig / getConfig', () => {
    it('合并配置不丢失其他字段', () => {
      const optimizer = new ConversationOptimizer()
      const original = optimizer.getConfig()
      optimizer.updateConfig({ pruneProtect: 50000 })
      const updated = optimizer.getConfig()
      expect(updated.pruneProtect).toBe(50000)
      expect(updated.pruneMinimum).toBe(original.pruneMinimum)
    })

    it('默认值正确', () => {
      const optimizer = new ConversationOptimizer()
      const config = optimizer.getConfig()
      expect(config.pruneProtect).toBe(40000)
      expect(config.recentRoundsProtect).toBe(2)
    })
  })

  describe('optimize', () => {
    it('不超限直接返回', async () => {
      const optimizer = new ConversationOptimizer()
      const msgs = [makeMsg('1', 'user', 'hi'), makeMsg('2', 'assistant', 'hello')]
      const result = await optimizer.optimize(msgs, {
        contextWindow: 100000,
        maxOutputTokens: 4096,
      })
      expect(result.pruned).toBe(0)
      expect(result.summarized).toBe(false)
      expect(result.messages).toEqual(msgs)
    })

    it('超限触发修剪', async () => {
      const optimizer = new ConversationOptimizer({
        pruneProtect: 10,
        pruneMinimum: 1,
        longMessageThreshold: 5,
        recentRoundsProtect: 1,
      })
      // 生成大量消息使 token 超限
      const longContent = 'a'.repeat(2000)
      const msgs: OptimizerMessage[] = []
      for (let i = 0; i < 20; i++) {
        msgs.push(makeMsg(`m${i}`, i % 2 === 0 ? 'user' : 'assistant', longContent))
      }
      const result = await optimizer.optimize(msgs, {
        contextWindow: 500,
        maxOutputTokens: 100,
      })
      // 应该有修剪或摘要发生
      expect(result.optimizedTokens).toBeLessThanOrEqual(result.originalTokens)
      expect(result.pruned > 0 || result.summarized).toBe(true)
    })
  })
})
