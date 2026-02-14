export interface ChunkResult {
  readonly content: string
  readonly sourceTitle?: string | undefined
  readonly chunkIndex: number
}

export interface ChunkerOptions {
  readonly chunkSize?: number | undefined
  readonly chunkOverlap?: number | undefined
}

const DEFAULT_CHUNK_SIZE = 1500
const DEFAULT_CHUNK_OVERLAP = 200

/**
 * 按 Markdown 标题分段
 */
function splitByMarkdownHeadings(text: string): readonly string[] {
  const sections: string[] = []
  const lines = text.split('\n')
  let current: string[] = []

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && current.length > 0) {
      const section = current.join('\n').trim()
      if (section) {
        sections.push(section)
      }
      current = [line]
    } else {
      current.push(line)
    }
  }

  const last = current.join('\n').trim()
  if (last) {
    sections.push(last)
  }

  return sections
}

/**
 * 按段落分割纯文本
 */
function splitByParagraphs(text: string): readonly string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * 将过长的文本按字符数滑动窗口分块
 */
function splitBySize(text: string, chunkSize: number, overlap: number): readonly string[] {
  if (text.length <= chunkSize) {
    return [text]
  }

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    if (end >= text.length) break
    start += chunkSize - overlap
  }

  return chunks
}

/**
 * 检测文本是否为 Markdown 格式
 */
function isMarkdown(text: string): boolean {
  return /^#{1,6}\s/m.test(text)
}

/**
 * 对文档进行分块
 */
export function chunkDocument(
  text: string,
  options: ChunkerOptions = {},
  sourceTitle?: string
): readonly ChunkResult[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const overlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP

  // 第一步：按结构分段
  const sections = isMarkdown(text) ? splitByMarkdownHeadings(text) : splitByParagraphs(text)

  // 第二步：合并过短的段落 / 拆分过长的段落
  const results: ChunkResult[] = []
  let buffer = ''
  let chunkIndex = 0

  for (const section of sections) {
    // 如果当前 buffer + section 不超限，合并
    if (buffer.length > 0 && buffer.length + section.length + 1 <= chunkSize) {
      buffer += '\n\n' + section
      continue
    }

    // 先输出 buffer
    if (buffer.length > 0) {
      for (const piece of splitBySize(buffer, chunkSize, overlap)) {
        results.push({ content: piece, sourceTitle, chunkIndex })
        chunkIndex++
      }
      buffer = ''
    }

    // 如果 section 本身超限，直接拆分
    if (section.length > chunkSize) {
      for (const piece of splitBySize(section, chunkSize, overlap)) {
        results.push({ content: piece, sourceTitle, chunkIndex })
        chunkIndex++
      }
    } else {
      buffer = section
    }
  }

  // 输出剩余 buffer
  if (buffer.length > 0) {
    for (const piece of splitBySize(buffer, chunkSize, overlap)) {
      results.push({ content: piece, sourceTitle, chunkIndex })
      chunkIndex++
    }
  }

  return results
}
