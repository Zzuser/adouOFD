export type TextKind = 'MD' | 'TXT'
export type TextEncoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'gb18030'
export type TextEol = 'lf' | 'crlf'

export const TEXT_ASSET_SCHEME = 'adou-file'

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.avif',
  '.ico',
  '.svg'
])

export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index).toLowerCase() : ''
}

export function isTextPath(path: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extensionOf(path))
}

export function textKindOf(path: string): TextKind | null {
  const extension = extensionOf(path)
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'MD'
  if (extension === '.txt') return 'TXT'
  return null
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(path))
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function detectEol(content: string): TextEol {
  let crlf = 0
  let lf = 0
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== '\n') continue
    if (index > 0 && content[index - 1] === '\r') crlf += 1
    else lf += 1
  }
  return crlf > lf ? 'crlf' : 'lf'
}

export function normalizeEol(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function applyEol(content: string, eol: TextEol): string {
  return eol === 'crlf' ? content.replace(/\n/g, '\r\n') : content
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function fileUrlToPath(value: string): string | null {
  try {
    const url = new URL(value)
    let path = safeDecode(url.pathname)
    if (/^\/[a-zA-Z]:/.test(path)) path = path.slice(1)
    if (url.hostname && url.hostname !== 'localhost') {
      return normalizeSegments(`\\\\${url.hostname}${path.replace(/\//g, '\\')}`)
    }
    return normalizeSegments(path.replace(/\//g, '\\'))
  } catch {
    return null
  }
}

function normalizeSegments(value: string): string {
  const normalized = value.replace(/\//g, '\\')
  let prefix = ''
  let rest = normalized
  if (/^[a-zA-Z]:/.test(rest)) {
    prefix = rest.slice(0, 2)
    rest = rest.slice(2)
  } else if (rest.startsWith('\\\\')) {
    prefix = '\\\\'
    rest = rest.slice(2)
  }
  const segments: string[] = []
  for (const segment of rest.split('\\')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length > 0) segments.pop()
      else if (!prefix) segments.push('..')
      continue
    }
    segments.push(segment)
  }
  if (prefix === '\\\\') return `\\\\${segments.join('\\')}`
  if (prefix) return `${prefix}\\${segments.join('\\')}`
  return segments.join('\\')
}

/**
 * 把 Markdown 中的图片/链接地址解析为本地绝对路径。
 * 仅接受相对路径、Windows 绝对路径和 file: URL；网络地址返回 null。
 */
export function resolveLocalReference(documentPath: string, rawReference: string): string | null {
  let reference = rawReference.trim()
  if (!reference) return null
  if (reference.startsWith('<') && reference.endsWith('>')) {
    reference = reference.slice(1, -1).trim()
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(reference)) {
    if (!/^file:/i.test(reference)) return null
    return fileUrlToPath(reference)
  }
  reference = reference.replace(/[?#].*$/, '')
  reference = safeDecode(reference).replace(/\//g, '\\')
  if (!reference) return null
  const document = documentPath.replace(/\//g, '\\')
  if (/^[a-zA-Z]:\\/.test(reference) || reference.startsWith('\\\\')) {
    return normalizeSegments(reference)
  }
  if (reference.startsWith('\\')) {
    const drive = document.match(/^[a-zA-Z]:/)?.[0]
    if (!drive) return null
    return normalizeSegments(`${drive}${reference}`)
  }
  const base = document.replace(/\\[^\\]*$/, '')
  return normalizeSegments(`${base}\\${reference}`)
}

export function textAssetUrl(absolutePath: string): string {
  return `${TEXT_ASSET_SCHEME}://asset/?path=${encodeURIComponent(absolutePath)}`
}

export function textAssetPathFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== `${TEXT_ASSET_SCHEME}:`) return null
    if (url.hostname !== 'asset') return null
    const path = url.searchParams.get('path')
    if (!path) return null
    return normalizeSegments(path)
  } catch {
    return null
  }
}
