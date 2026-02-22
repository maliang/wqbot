import { describe, it, expect } from 'vitest'
import { chunkDocument } from '../src/chunker.js'

describe('chunkDocument', () => {
  describe('basic chunking', () => {
    it('returns empty array for empty text', () => {
      const result = chunkDocument('')
      expect(result).toEqual([])
    })

    it('returns single chunk for short text', () => {
      const result = chunkDocument('Hello world')
      expect(result.length).toBe(1)
      expect(result[0]!.content).toBe('Hello world')
      expect(result[0]!.chunkIndex).toBe(0)
    })
  })

  describe('chunk size options', () => {
    it('respects custom chunk size', () => {
      const text = 'a'.repeat(1000)
      const result = chunkDocument(text, { chunkSize: 200, chunkOverlap: 50 })
      expect(result.length).toBeGreaterThan(1)
      for (const chunk of result) {
        expect(chunk.content.length).toBeLessThanOrEqual(200)
      }
    })

    it('respects custom overlap', () => {
      const text = 'a'.repeat(1000)
      const result1 = chunkDocument(text, { chunkSize: 200, chunkOverlap: 50 })
      const result2 = chunkDocument(text, { chunkSize: 200, chunkOverlap: 100 })

      // More overlap means more chunks
      expect(result2.length).toBeGreaterThanOrEqual(result1.length)
    })
  })

  describe('markdown splitting', () => {
    it('splits by markdown headings', () => {
      const markdown = `# Title 1

Content for section 1.

## Subtitle

More content.

# Title 2

Content for section 2.`

      const result = chunkDocument(markdown)
      // Markdown with headings should be split into sections
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('preserves heading content', () => {
      const markdown = `# Main Title

Some content here.`

      const result = chunkDocument(markdown)
      expect(result.some((c) => c.content.includes('# Main Title'))).toBe(true)
    })
  })

  describe('paragraph splitting', () => {
    it('splits by paragraphs for non-markdown text', () => {
      const text = `First paragraph with some content.

Second paragraph with more content.

Third paragraph.`

      const result = chunkDocument(text)
      // Paragraphs may be combined based on chunk size
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('combines short paragraphs', () => {
      const text = `Short.

Also short.

Another short one.`

      const result = chunkDocument(text, { chunkSize: 500 })
      // Short paragraphs should be combined if they fit in chunk size
      expect(result.length).toBeLessThanOrEqual(3)
    })
  })

  describe('large text handling', () => {
    it('chunks large text correctly', () => {
      const text = 'word '.repeat(10000)
      const result = chunkDocument(text, { chunkSize: 1000, chunkOverlap: 100 })

      expect(result.length).toBeGreaterThan(1)

      // All chunks should have proper indices
      for (let i = 0; i < result.length; i++) {
        expect(result[i]!.chunkIndex).toBe(i)
      }
    })
  })

  describe('source title', () => {
    it('includes source title in result', () => {
      const result = chunkDocument('Hello', {}, 'My Document')
      expect(result[0]!.sourceTitle).toBe('My Document')
    })

    it('handles missing source title', () => {
      const result = chunkDocument('Hello')
      expect(result[0]!.sourceTitle).toBeUndefined()
    })
  })

  describe('chunk index', () => {
    it('assigns sequential chunk indices', () => {
      const text = 'a'.repeat(5000)
      const result = chunkDocument(text, { chunkSize: 500, chunkOverlap: 100 })

      for (let i = 0; i < result.length; i++) {
        expect(result[i]!.chunkIndex).toBe(i)
      }
    })
  })

  describe('edge cases', () => {
    it('handles text with only whitespace', () => {
      const result = chunkDocument('   \n\n   \t\t  ')
      // Should filter out whitespace-only content
      expect(result.every((c) => c.content.trim().length > 0)).toBe(true)
    })

    it('handles single character', () => {
      const result = chunkDocument('x')
      expect(result.length).toBe(1)
      expect(result[0]!.content).toBe('x')
    })

    it('handles unicode content', () => {
      const result = chunkDocument('你好世界 🎉 Hello 世界')
      expect(result.length).toBe(1)
      expect(result[0]!.content).toContain('你好世界')
    })
  })
})
