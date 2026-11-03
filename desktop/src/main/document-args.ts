import { existsSync, statSync } from 'node:fs'
import { extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCUMENT_EXTENSIONS = new Set(['.ofd', '.pdf', '.md', '.markdown', '.txt'])

/**
 * 从启动参数中提取可打开的文档路径。安装版由文件关联传入 `"<path>"`，
 * 开发模式下 argv 还包含应用目录与调试参数，因此按扩展名和文件存在性过滤。
 */
export function parseDocumentPaths(argv: readonly string[], workingDirectory: string): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const raw of argv) {
    if (!raw || raw.startsWith('-')) continue
    let value = raw.trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }
    if (value.startsWith('file://')) {
      try {
        value = fileURLToPath(value)
      } catch {
        continue
      }
    }
    if (!DOCUMENT_EXTENSIONS.has(extname(value).toLowerCase())) continue
    const absolute = isAbsolute(value) ? value : resolve(workingDirectory, value)
    try {
      if (!existsSync(absolute) || !statSync(absolute).isFile()) continue
    } catch {
      continue
    }
    const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute
    if (seen.has(key)) continue
    seen.add(key)
    result.push(absolute)
  }
  return result
}
