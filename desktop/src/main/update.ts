import { app, net, shell, type WebContents } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { once } from 'node:events'
import {
  compareVersions,
  isAllowedUpdateUrl,
  parseUpdateManifest
} from '../shared/update'
import type {
  UpdateCheckResult,
  UpdateDownload,
  UpdateDownloadResult,
  UpdateProgress
} from '../shared/types'

const DEFAULT_MANIFEST_URL = 'https://minio.grout.cn/adou-ofd/updates/stable.json'
const MANIFEST_URL = process.env.ADOU_UPDATE_URL?.trim() || DEFAULT_MANIFEST_URL
// CNB Release 下载地址会 302 到 asset.cnb.cool，最终域名也要放行
const ALLOWED_HOSTS = new Set([
  'minio.grout.cn',
  'testminio.grout.cn',
  'cnb.cool',
  'asset.cnb.cool'
])
const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

let activeDownload: AbortController | null = null
let lastDownloadedPath: string | null = null

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const base = {
    currentVersion,
    updateAvailable: false,
    manifest: null,
    download: null,
    error: null
  } satisfies UpdateCheckResult
  try {
    if (!isAllowedUpdateUrl(MANIFEST_URL, ALLOWED_HOSTS)) {
      return { ...base, error: '更新地址不在允许的域名内' }
    }
    const response = await net.fetch(MANIFEST_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!response.ok) {
      return { ...base, error: `检查更新失败（HTTP ${response.status}）` }
    }
    const text = await response.text()
    if (text.length > MAX_MANIFEST_BYTES) {
      return { ...base, error: '更新清单过大' }
    }
    const manifest = parseUpdateManifest(JSON.parse(text))
    const download = manifest.downloads['windows-x64']
    if (!isAllowedUpdateUrl(download.url, ALLOWED_HOSTS)) {
      return { ...base, manifest, error: '更新下载地址不在允许的域名内' }
    }
    if (download.size > MAX_DOWNLOAD_BYTES) {
      return { ...base, manifest, error: '更新安装包超过允许的大小' }
    }
    const updateAvailable = compareVersions(manifest.version, currentVersion) > 0
    return {
      ...base,
      updateAvailable,
      manifest,
      download: updateAvailable ? download : null
    }
  } catch (error) {
    return { ...base, error: updateErrorMessage(error, '检查更新失败') }
  }
}

export async function downloadUpdate(
  payload: unknown,
  sender: WebContents
): Promise<UpdateDownloadResult> {
  const download = validateDownload(payload)
  if (!download) {
    return { ok: false, error: '更新下载参数无效' }
  }
  if (activeDownload) {
    return { ok: false, error: '已有更新正在下载' }
  }
  const controller = new AbortController()
  activeDownload = controller
  lastDownloadedPath = null
  let tempPath: string | null = null
  try {
    const directory = app.getPath('downloads')
    const target = await uniqueTarget(directory, downloadFileName(download.url))
    tempPath = `${target}.part`
    await fs.rm(tempPath, { force: true })
    const response = await net.fetch(download.url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    })
    if (!response.ok) {
      return { ok: false, error: `下载失败（HTTP ${response.status}）` }
    }
    if (response.url && !isAllowedUpdateUrl(response.url, ALLOWED_HOSTS)) {
      return { ok: false, error: '下载地址跳转到了不允许的域名' }
    }
    if (!response.body) {
      return { ok: false, error: '下载响应为空' }
    }
    const reader = response.body.getReader()
    const stream = createWriteStream(tempPath, { flags: 'wx' })
    const hash = createHash('sha256')
    let received = 0
    let lastReport = 0
    let writeError: unknown = null
    stream.on('error', (error) => {
      writeError = error
    })
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        received += value.byteLength
        if (received > MAX_DOWNLOAD_BYTES || received > download.size) {
          controller.abort()
          throw new Error('下载内容超过声明大小')
        }
        hash.update(value)
        if (!stream.write(Buffer.from(value))) {
          await once(stream, 'drain')
        }
        const now = Date.now()
        if (now - lastReport > 200 || received === download.size) {
          lastReport = now
          reportProgress(sender, { received, total: download.size })
        }
      }
      await new Promise<void>((resolve) => stream.end(resolve))
    } catch (error) {
      stream.destroy()
      throw writeError ?? error
    }
    if (received !== download.size) {
      throw new Error(`下载大小不一致：期望 ${download.size} 字节，实际 ${received} 字节`)
    }
    const actual = hash.digest('hex')
    if (actual !== download.sha256.toLowerCase()) {
      throw new Error('SHA256 校验失败，安装包可能不完整或被篡改')
    }
    await fs.rename(tempPath, target)
    tempPath = null
    lastDownloadedPath = target
    reportProgress(sender, { received, total: download.size })
    return { ok: true, path: target }
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, error: '下载已取消' }
    }
    return { ok: false, error: updateErrorMessage(error, '下载失败') }
  } finally {
    activeDownload = null
    if (tempPath) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined)
    }
  }
}

export function cancelUpdateDownload(): void {
  activeDownload?.abort()
}

/**
 * 运行已下载并通过 SHA256 校验的安装包。
 * 只允许本次会话实际下载成功的路径，避免渲染进程执行任意文件。
 */
export async function installDownloadedUpdate(rawPath: unknown): Promise<UpdateDownloadResult> {
  if (typeof rawPath !== 'string' || !lastDownloadedPath || rawPath !== lastDownloadedPath) {
    return { ok: false, error: '安装包路径无效，请重新下载' }
  }
  if (!existsSync(rawPath)) {
    return { ok: false, error: '安装包不存在，请重新下载' }
  }
  const error = await shell.openPath(rawPath)
  if (error) {
    return { ok: false, error: `无法启动安装包：${error}` }
  }
  return { ok: true, path: rawPath }
}

function validateDownload(raw: unknown): UpdateDownload | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const url = typeof value.url === 'string' ? value.url.trim() : ''
  const size = typeof value.size === 'number' ? value.size : Number.NaN
  const sha256 = typeof value.sha256 === 'string' ? value.sha256.toLowerCase() : ''
  if (!url || !Number.isFinite(size) || size <= 0 || size > MAX_DOWNLOAD_BYTES) return null
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null
  if (!isAllowedUpdateUrl(url, ALLOWED_HOSTS)) return null
  return { url, size: Math.round(size), sha256 }
}

function downloadFileName(url: string): string {
  try {
    const name = decodeURIComponent(basename(new URL(url).pathname))
    const safe = name.replace(/[^A-Za-z0-9._-]/g, '_')
    return safe || 'adou-ofd-update.bin'
  } catch {
    return 'adou-ofd-update.bin'
  }
}

async function uniqueTarget(directory: string, name: string): Promise<string> {
  const extension = extname(name)
  const base = extension ? name.slice(0, -extension.length) : name
  let candidate = join(directory, name)
  let index = 1
  while (existsSync(candidate) || existsSync(`${candidate}.part`)) {
    candidate = join(directory, `${base}-${index}${extension}`)
    index += 1
  }
  return candidate
}

function reportProgress(sender: WebContents, progress: UpdateProgress): void {
  if (!sender.isDestroyed()) {
    sender.send('update:progress', progress)
  }
}

function updateErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return `${fallback}：请求超时`
    }
    return `${fallback}：${error.message}`
  }
  return fallback
}
