import { net, protocol } from 'electron'
import {
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import iconv from 'iconv-lite'
import type { TextFileData, TextFileWriteResult } from '../shared/types'
import type { TextEncoding } from '../shared/text-paths'
import {
  TEXT_ASSET_SCHEME,
  applyEol,
  detectEol,
  fileNameOf,
  isImagePath,
  isTextPath,
  normalizeEol,
  textAssetPathFromUrl
} from '../shared/text-paths'

const MAX_TEXT_BYTES = 16 * 1024 * 1024
const allowedAssetRoots = new Set<string>()
const openedTextFiles = new Set<string>()

const ENCODINGS = new Set<TextEncoding>(['utf-8', 'utf-8-bom', 'utf-16le', 'utf-16be', 'gb18030'])

export function registerTextAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: TEXT_ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

export function installTextAssetProtocol(): void {
  protocol.handle(TEXT_ASSET_SCHEME, async (request) => {
    const filePath = resolveAllowedAsset(request.url)
    if (!filePath) {
      return new Response(null, { status: 403 })
    }
    try {
      const response = await net.fetch(pathToFileURL(filePath).toString())
      const headers = new Headers(response.headers)
      headers.set('Cache-Control', 'no-cache')
      headers.set('X-Content-Type-Options', 'nosniff')
      return new Response(response.body, { status: response.status, headers })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

function resolveAllowedAsset(rawUrl: string): string | null {
  const requested = textAssetPathFromUrl(rawUrl)
  if (!requested || !isImagePath(requested)) return null
  const candidate = resolve(requested)
  const normalizedCandidate = candidate.toLowerCase()
  let allowed = false
  for (const root of allowedAssetRoots) {
    const inside = relative(root, normalizedCandidate)
    if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) {
      allowed = true
      break
    }
  }
  if (!allowed) return null
  try {
    const stat = statSync(candidate)
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES * 4) return null
  } catch {
    return null
  }
  return candidate
}

function requireTextPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error('文件路径无效')
  }
  const filePath = resolve(rawPath.trim())
  if (!isTextPath(filePath)) {
    throw new Error('当前仅支持 .md / .markdown / .txt 文本文件')
  }
  return filePath
}

function allowAssetRoot(filePath: string): void {
  allowedAssetRoots.add(dirname(resolve(filePath)).toLowerCase())
}

interface DecodedText {
  content: string
  encoding: TextEncoding
}

function decodeUtf16(buffer: Buffer, littleEndian: boolean): string {
  return new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(buffer)
}

function looksLikeUtf16(buffer: Buffer): 'utf-16le' | 'utf-16be' | null {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  if (sample.length < 8) return null
  let evenZeros = 0
  let oddZeros = 0
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] === 0) {
      if (index % 2 === 0) evenZeros += 1
      else oddZeros += 1
    }
  }
  const totalZeros = evenZeros + oddZeros
  if (totalZeros < sample.length * 0.15) return null
  return oddZeros >= evenZeros ? 'utf-16le' : 'utf-16be'
}

export function decodeTextBuffer(buffer: Buffer): DecodedText {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {
      content: new TextDecoder('utf-8').decode(buffer.subarray(3)),
      encoding: 'utf-8-bom'
    }
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { content: decodeUtf16(buffer.subarray(2), true), encoding: 'utf-16le' }
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { content: decodeUtf16(buffer.subarray(2), false), encoding: 'utf-16be' }
  }
  const utf16 = looksLikeUtf16(buffer)
  if (utf16) {
    return { content: decodeUtf16(buffer, utf16 === 'utf-16le'), encoding: utf16 }
  }
  try {
    return {
      content: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      encoding: 'utf-8'
    }
  } catch {
    return { content: new TextDecoder('gb18030').decode(buffer), encoding: 'gb18030' }
  }
}

export function encodeText(content: string, encoding: TextEncoding): Buffer {
  switch (encoding) {
    case 'utf-8-bom':
      return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, 'utf8')])
    case 'utf-16le':
      return Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(content, 'utf16-le')])
    case 'utf-16be':
      return Buffer.concat([Buffer.from([0xfe, 0xff]), iconv.encode(content, 'utf16-be')])
    case 'gb18030':
      return iconv.encode(content, 'gb18030')
    default:
      return Buffer.from(content, 'utf8')
  }
}

export function readTextFile(rawPath: unknown): TextFileData {
  const filePath = requireTextPath(rawPath)
  const stat = statSync(filePath)
  if (!stat.isFile()) {
    throw new Error('只能打开文本文件')
  }
  if (stat.size > MAX_TEXT_BYTES) {
    throw new Error('文件超过 16 MB，暂不支持在应用内编辑')
  }
  const decoded = decodeTextBuffer(readFileSync(filePath))
  const normalized = normalizeEol(decoded.content)
  allowAssetRoot(filePath)
  openedTextFiles.add(filePath.toLowerCase())
  return {
    path: filePath,
    name: fileNameOf(filePath),
    content: normalized,
    encoding: decoded.encoding,
    eol: detectEol(decoded.content),
    size: stat.size,
    modifiedAt: stat.mtimeMs
  }
}

export function writeTextFile(rawOptions: unknown): TextFileWriteResult {
  try {
    if (typeof rawOptions !== 'object' || rawOptions === null) {
      return { ok: false, code: 'IO_ERROR', message: '保存参数无效' }
    }
    const options = rawOptions as Record<string, unknown>
    const filePath = requireTextPath(options.path)
    if (!openedTextFiles.has(filePath.toLowerCase())) {
      return { ok: false, code: 'IO_ERROR', message: '文件未在应用中打开，无法保存' }
    }
    if (typeof options.content !== 'string') {
      return { ok: false, code: 'IO_ERROR', message: '保存内容无效' }
    }
    const encoding = ENCODINGS.has(options.encoding as TextEncoding)
      ? (options.encoding as TextEncoding)
      : 'utf-8'
    const eol = options.eol === 'crlf' ? 'crlf' : 'lf'
    const stat = statSync(filePath)
    if (!stat.isFile()) {
      return { ok: false, code: 'IO_ERROR', message: '只能保存文本文件' }
    }
    const expected =
      typeof options.expectedModifiedAt === 'number' ? options.expectedModifiedAt : null
    if (expected !== null && Math.abs(stat.mtimeMs - expected) > 1) {
      return {
        ok: false,
        code: 'CONFLICT',
        message: '文件已在其他程序中修改',
        onDiskModifiedAt: stat.mtimeMs
      }
    }
    const data = encodeText(applyEol(options.content, eol), encoding)
    if (data.length > MAX_TEXT_BYTES) {
      return { ok: false, code: 'IO_ERROR', message: '文件超过 16 MB，暂不支持保存' }
    }
    const temporary = `${filePath}.adou-save.tmp`
    try {
      writeFileSync(temporary, data, { mode: stat.mode })
      renameSync(temporary, filePath)
    } finally {
      rmSync(temporary, { force: true })
    }
    const updated = statSync(filePath)
    allowAssetRoot(filePath)
    return { ok: true, size: updated.size, modifiedAt: updated.mtimeMs }
  } catch (error) {
    return {
      ok: false,
      code: 'IO_ERROR',
      message: error instanceof Error ? error.message : '保存失败'
    }
  }
}
