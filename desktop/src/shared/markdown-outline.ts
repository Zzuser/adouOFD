export interface MarkdownHeading {
  level: number
  text: string
  line: number
}

export function normalizeHeadingText(value: string): string {
  return value
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 提取 ATX 标题（# 标题）作为目录，忽略围栏代码块内的 # 行。
 */
export function extractMarkdownOutline(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  let fence: string | null = null
  const lines = content.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (fence) {
      if (trimmed === fence.repeat(3) || /^(`{3,}|~{3,})$/.test(trimmed) && trimmed[0] === fence) {
        fence = null
      }
      continue
    }
    const opening = /^(`{3,}|~{3,})/.exec(trimmed)
    if (opening) {
      fence = opening[1][0]
      continue
    }
    const match = /^(#{1,6})\s+(.*)$/.exec(line)
    if (!match) continue
    const text = normalizeHeadingText(match[2].replace(/\s+#+\s*$/, ''))
    if (!text) continue
    headings.push({ level: match[1].length, text, line: index + 1 })
  }
  return headings
}
