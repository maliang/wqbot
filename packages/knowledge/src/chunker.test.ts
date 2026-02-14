import { describe, it, expect } from 'vitest'
import { chunkDocument } from './chunker.js'

describe('chunkDocument', () => {
  it('短文本不分块，返回单个 chunk', () => {
    const result = chunkDocument('Hello world', { chunkSize: 100 })
    expect(result).toHaveLength(1)
    expect(result[0]!.content).toBe('Hello world')
  })

  it('空内容返回空数组', () => {
    expect(chunkDocument('')).toEqual([])
    expect(chunkDocument('   ')).toEqual([])
  })

  it('长文本按字符分块，overlap 正确', () => {
    // 生成超过 chunkSize 的纯文本（无 markdown 标题，无双换行 → 单段落）
    const text = 'A'.repeat(300)
    const result = chunkDocument(text, { chunkSize: 100, chunkOverlap: 20 })

    // 每块最多 100 字符
    for (const chunk of result) {
      expect(chunk.content.length).toBeLessThanOrEqual(100)
    }
    // 至少 3 块（300 / (100-20) = 3.75）
    expect(result.length).toBeGreaterThanOrEqual(3)

    // 验证 overlap：第二块开头应与第一块末尾有重叠
    const firstEnd = result[0]!.content.slice(-20)
    const secondStart = result[1]!.content.slice(0, 20)
    expect(secondStart).toBe(firstEnd)
  })

  it('Markdown 按标题分段', () => {
    // 每个段落足够大，使得合并后超过 chunkSize，迫使按标题边界切分
    const filler = '这是一段填充文本。'.repeat(20) // ~180 字符
    const md = [
      '# 标题一',
      filler,
      '## 标题二',
      filler,
      '## 标题三',
      filler,
    ].join('\n')

    // chunkSize 设为略大于单个段落，使每个标题段独立成块
    const result = chunkDocument(md, { chunkSize: 250 })
    expect(result.length).toBeGreaterThanOrEqual(3)
    // 验证标题分布在不同 chunk 中
    const contents = result.map((c) => c.content)
    expect(contents.some((c) => c.includes('标题一'))).toBe(true)
    expect(contents.some((c) => c.includes('标题二'))).toBe(true)
    expect(contents.some((c) => c.includes('标题三'))).toBe(true)
  })

  it('自定义 chunkSize 和 chunkOverlap 参数生效', () => {
    const text = 'word '.repeat(200) // ~1000 字符
    const small = chunkDocument(text, { chunkSize: 100, chunkOverlap: 10 })
    const large = chunkDocument(text, { chunkSize: 500, chunkOverlap: 50 })
    // 更小的 chunkSize 应产生更多块
    expect(small.length).toBeGreaterThan(large.length)
  })

  it('sourceTitle 正确传递到每个 chunk', () => {
    const result = chunkDocument('一些内容', { chunkSize: 5000 }, '测试文档')
    expect(result).toHaveLength(1)
    expect(result[0]!.sourceTitle).toBe('测试文档')
  })

  it('sourceTitle 未传递时为 undefined', () => {
    const result = chunkDocument('一些内容', { chunkSize: 5000 })
    expect(result[0]!.sourceTitle).toBeUndefined()
  })

  it('chunkIndex 从 0 递增', () => {
    const md = [
      '# A',
      '内容A',
      '## B',
      '内容B',
      '## C',
      '内容C',
    ].join('\n')

    const result = chunkDocument(md, { chunkSize: 5000 })
    result.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i)
    })
  })

  it('使用默认参数（不传 options）正常工作', () => {
    const text = '这是一段普通文本'
    const result = chunkDocument(text)
    expect(result).toHaveLength(1)
    expect(result[0]!.content).toBe(text)
    expect(result[0]!.chunkIndex).toBe(0)
  })
})
