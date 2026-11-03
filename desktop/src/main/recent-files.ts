import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { RecentFile } from '../shared/types'

const MAX_RECENT_FILES = 20
const STORE_NAME = 'recent-files.json'

function storePath(): string {
  return join(app.getPath('userData'), STORE_NAME)
}

function samePath(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function sanitize(raw: unknown): RecentFile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const path = typeof value.path === 'string' ? value.path.trim() : ''
  if (!path || path.length > 4096 || !/\.(ofd|pdf)$/i.test(path)) return null
  const tempPrefix = `${join(app.getPath('temp'), 'adou-')}`.toLowerCase()
  if (path.toLowerCase().startsWith(tempPrefix)) return null
  const kind = value.kind === 'PDF' || /\.pdf$/i.test(path) ? 'PDF' : 'OFD'
  const name =
    typeof value.name === 'string' && value.name.trim()
      ? value.name.trim().slice(0, 260)
      : path.split(/[\\/]/).pop() || path
  const pageCount =
    Number.isInteger(value.pageCount) && Number(value.pageCount) > 0
      ? Number(value.pageCount)
      : 0
  const openedAt = Number.isFinite(value.openedAt) ? Number(value.openedAt) : Date.now()
  return { path, name, kind, pageCount, openedAt }
}

function read(): RecentFile[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(storePath(), 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => sanitize(entry))
      .filter((entry): entry is RecentFile => entry !== null)
  } catch {
    return []
  }
}

function write(entries: RecentFile[]): void {
  const target = storePath()
  mkdirSync(dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  writeFileSync(temporary, JSON.stringify(entries, null, 2), 'utf8')
  renameSync(temporary, target)
}

function prune(entries: RecentFile[]): RecentFile[] {
  return entries.filter((entry) => existsSync(entry.path)).slice(0, MAX_RECENT_FILES)
}

export function listRecentFiles(): RecentFile[] {
  const entries = read()
  const pruned = prune(entries)
  if (pruned.length !== entries.length) {
    write(pruned)
  }
  return pruned
}

export function addRecentFile(raw: unknown): RecentFile[] {
  const entry = sanitize(raw)
  if (!entry) return listRecentFiles()
  const entries = read().filter((item) => !samePath(item.path, entry.path))
  entries.unshift({ ...entry, openedAt: Date.now() })
  const next = prune(entries)
  write(next)
  return next
}

export function removeRecentFile(rawPath: unknown): RecentFile[] {
  if (typeof rawPath !== 'string') return listRecentFiles()
  const next = listRecentFiles().filter((entry) => !samePath(entry.path, rawPath))
  write(next)
  return next
}

export function clearRecentFiles(): void {
  write([])
}
