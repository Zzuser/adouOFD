import type { UpdateDownload, UpdateManifest } from './types'

/**
 * 比较两个版本号（忽略前缀 v，支持预发布后缀）。
 * 返回 >0 表示 left 更新，<0 表示 right 更新，0 表示相同。
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return 0
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index]
  }
  if (a.pre === b.pre) return 0
  if (!a.pre) return 1
  if (!b.pre) return -1
  return a.pre > b.pre ? 1 : -1
}

function parseVersion(value: string): { core: number[]; pre: string } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(value.trim())
  if (!match) return null
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ?? ''
  }
}

export function isValidSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value)
}

export function isAllowedUpdateUrl(raw: string, hosts: ReadonlySet<string>): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:'
      && hosts.has(url.hostname)
      && (url.port === '' || url.port === '443')
  } catch {
    return false
  }
}

export function parseUpdateManifest(raw: unknown): UpdateManifest {
  if (typeof raw !== 'object' || raw === null) throw new Error('更新清单格式无效')
  const value = raw as Record<string, unknown>
  const version = typeof value.version === 'string' ? value.version.trim() : ''
  if (!version) throw new Error('更新清单缺少版本号')
  const downloadsRaw = value.downloads
  if (typeof downloadsRaw !== 'object' || downloadsRaw === null) {
    throw new Error('更新清单缺少下载地址')
  }
  const downloads: Record<string, UpdateDownload> = {}
  for (const [key, item] of Object.entries(downloadsRaw as Record<string, unknown>)) {
    const download = parseDownload(item)
    if (download) downloads[key] = download
  }
  if (!downloads['windows-x64']) throw new Error('更新清单缺少 Windows 下载地址')
  const notes = Array.isArray(value.notes)
    ? value.notes.filter((item): item is string => typeof item === 'string')
    : typeof value.notes === 'string'
      ? [value.notes]
      : []
  return {
    version,
    channel: typeof value.channel === 'string' ? value.channel : undefined,
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : undefined,
    minVersion: typeof value.minVersion === 'string' ? value.minVersion : undefined,
    notesUrl: typeof value.notesUrl === 'string' ? value.notesUrl : undefined,
    notes,
    downloads
  }
}

function parseDownload(raw: unknown): UpdateDownload | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const url = typeof value.url === 'string' ? value.url.trim() : ''
  const size = typeof value.size === 'number' ? value.size : Number.NaN
  if (!url || !Number.isFinite(size) || size <= 0) return null
  if (!isValidSha256(value.sha256)) return null
  return { url, size: Math.round(size), sha256: value.sha256.toLowerCase() }
}
