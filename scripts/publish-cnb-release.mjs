#!/usr/bin/env node
/**
 * 把 GitHub Actions 已构建的安装包同步到 CNB Release，并更新固定 update tag 的 stable.json。
 * 需要在仓库 Secrets 中配置 CNB_TOKEN（CNB 访问令牌，权限 repo-release:rw）。
 * 支持 CNB_DRY_RUN=1 只校验本地文件，不发起网络请求。
 */
import { appendFileSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'

const token = process.env.CNB_TOKEN?.trim()
const repo = process.env.CNB_REPO?.trim() || 'Zzuser/adouOFD'
const version = process.env.APP_VERSION?.trim()
const tag = process.env.GITHUB_REF_NAME?.trim() || (version ? `v${version}` : '')
const target = process.env.CNB_TARGET_COMMITISH?.trim() || 'main'
const updateTag = process.env.CNB_UPDATE_TAG?.trim() || 'update'
const root = process.cwd()
const outDir = join(root, 'desktop', 'dist-inno')
const dryRun = process.env.CNB_DRY_RUN === '1'

if (!version) fail('缺少 APP_VERSION')
if (!tag.startsWith('v')) fail(`标签格式异常：${tag}`)
if (!token && !dryRun) fail('缺少 CNB_TOKEN，请配置 CNB 访问令牌（repo-release:rw）')

const installerName = `adou-ofd-${version}-x64-inno.exe`
const installerPath = join(outDir, installerName)
const notesFile = join(outDir, `RELEASE-NOTES-${version}.md`)
const assets = [
  installerPath,
  join(outDir, `SHA256-${version}.txt`),
  notesFile,
  join(root, 'LICENSE'),
  join(root, 'PRIVACY.md'),
  join(root, 'THIRD-PARTY-NOTICES.md')
]
for (const path of assets) {
  if (!existsSync(path)) fail(`缺少待上传文件：${path}`)
}

const body = readFileSync(notesFile, 'utf8')
const api = `https://api.cnb.cool/${repo}`
const auth = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.cnb.api+json' }
const json = { ...auth, 'Content-Type': 'application/json' }
const releaseName = `阿豆OFD ${version}`

if (dryRun) {
  console.log(`[dry-run] ${releaseName} ${tag} -> ${api}`)
  for (const path of assets) console.log(`[dry-run] ${basename(path)} ${statSync(path).size}`)
  console.log(`[dry-run] stable.json -> ${updateTag} (${parseNotes(body).length} notes)`)
  process.exit(0)
}

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: { ...auth, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    signal: AbortSignal.timeout(30_000)
  })
  const text = await response.text()
  return { response, text }
}

async function findRelease(tagName) {
  const found = await request(`/-/releases/tags/${encodeURIComponent(tagName)}`)
  if (found.response.ok) return JSON.parse(found.text)
  if (found.response.status !== 404) fail(`查询 CNB Release 失败：${found.response.status} ${found.text}`)
  return null
}

async function ensureRelease(tagName, name, releaseBody, prerelease, makeLatest) {
  const found = await findRelease(tagName)
  if (found) {
    const updated = await request(`/-/releases/${found.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, body: releaseBody, draft: false, prerelease, make_latest: makeLatest })
    })
    if (!updated.response.ok) fail(`更新 CNB Release 失败：${updated.response.status} ${updated.text}`)
    console.log(`复用 CNB Release ${tagName}`)
    return found
  }

  const created = await request('/-/releases', {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tagName,
      target_commitish: target,
      name,
      body: releaseBody,
      draft: false,
      prerelease,
      make_latest: makeLatest
    })
  })
  if (!created.response.ok) fail(`创建 CNB Release 失败：${created.response.status} ${created.text}`)
  console.log(`创建 CNB Release ${tagName}`)
  return JSON.parse(created.text)
}

async function uploadAsset(releaseId, name, content) {
  const targetUpload = await request(`/-/releases/${releaseId}/asset-upload-url`, {
    method: 'POST',
    body: JSON.stringify({ asset_name: name, size: content.length, overwrite: true, ttl: 0 })
  })
  if (!targetUpload.response.ok) fail(`获取上传地址失败（${name}）：${targetUpload.response.status} ${targetUpload.text}`)
  const upload = JSON.parse(targetUpload.text)

  const put = await fetch(upload.upload_url, {
    method: 'PUT',
    body: content,
    headers: { 'Content-Type': 'application/octet-stream' },
    signal: AbortSignal.timeout(600_000)
  })
  if (!put.ok) fail(`上传失败（${name}）：${put.status} ${(await put.text()).slice(0, 300)}`)

  const confirm = await fetch(upload.verify_url, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ ttl: 0 }),
    signal: AbortSignal.timeout(60_000)
  })
  if (!confirm.ok) fail(`确认上传失败（${name}）：${confirm.status} ${(await confirm.text()).slice(0, 300)}`)
  console.log(`已上传 ${name}（${(content.length / 1024 / 1024).toFixed(1)} MB）`)
}

async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function parseNotes(markdown) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim())
  const start = lines.findIndex((line) => line.startsWith('## ') && line.includes('重点变化'))
  const end = start >= 0 ? lines.findIndex((line, index) => index > start && line.startsWith('## ')) : -1
  const scope = start >= 0 ? lines.slice(start + 1, end >= 0 ? end : undefined) : lines
  const notes = scope
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
  return notes.length > 0 ? notes.slice(0, 5) : [`阿豆OFD ${version}`]
}

async function main() {
  const release = await ensureRelease(tag, releaseName, body, false, 'true')
  for (const path of assets) {
    await uploadAsset(release.id, basename(path), readFileSync(path))
  }

  const manifestRelease = await ensureRelease(
    updateTag,
    '更新清单',
    '由发布流水线自动维护，请勿手动修改。',
    true,
    'false'
  )
  const manifest = {
    version,
    channel: 'stable',
    publishedAt: new Date().toISOString(),
    minVersion: '1.0.0',
    notes: parseNotes(body),
    downloads: {
      'windows-x64': {
        url: `https://cnb.cool/${repo}/-/releases/download/${encodeURIComponent(tag)}/${installerName}`,
        size: statSync(installerPath).size,
        sha256: await sha256File(installerPath)
      }
    }
  }
  await uploadAsset(manifestRelease.id, 'stable.json', Buffer.from(JSON.stringify(manifest, null, 2)))

  const page = `https://cnb.cool/${repo}/-/releases/tag/${encodeURIComponent(tag)}`
  const manifestUrl = `https://cnb.cool/${repo}/-/releases/download/${updateTag}/stable.json`
  console.log(`CNB Release：${page}`)
  console.log(`更新清单：${manifestUrl}`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### CNB Release\n\n${page}\n\n### 更新清单\n\n${manifestUrl}\n\n`
    )
  }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
