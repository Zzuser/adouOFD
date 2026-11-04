#!/usr/bin/env node
/**
 * 把 GitHub Actions 已构建的安装包同步到 CNB Release。
 * 需要在仓库 Secrets 中配置 CNB_TOKEN（CNB 访问令牌，权限 repo-release:rw）。
 * 支持 CNB_DRY_RUN=1 只校验本地文件，不发起网络请求。
 */
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const token = process.env.CNB_TOKEN?.trim()
const repo = process.env.CNB_REPO?.trim() || 'Zzuser/adouOFD'
const version = process.env.APP_VERSION?.trim()
const tag = process.env.GITHUB_REF_NAME?.trim() || (version ? `v${version}` : '')
const target = process.env.CNB_TARGET_COMMITISH?.trim() || 'main'
const root = process.cwd()
const outDir = join(root, 'desktop', 'dist-inno')
const dryRun = process.env.CNB_DRY_RUN === '1'

if (!version) fail('缺少 APP_VERSION')
if (!tag.startsWith('v')) fail(`标签格式异常：${tag}`)
if (!token && !dryRun) fail('缺少 CNB_TOKEN，请配置 CNB 访问令牌（repo-release:rw）')

const notesFile = join(outDir, `RELEASE-NOTES-${version}.md`)
const assets = [
  join(outDir, `adou-ofd-${version}-x64-inno.exe`),
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

async function main() {
  const found = await request(`/-/releases/tags/${encodeURIComponent(tag)}`)
  let release
  if (found.response.ok) {
    release = JSON.parse(found.text)
    const updated = await request(`/-/releases/${release.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: releaseName, body, draft: false, prerelease: false, make_latest: 'true' })
    })
    if (!updated.response.ok) fail(`更新 CNB Release 失败：${updated.response.status} ${updated.text}`)
    console.log(`复用 CNB Release ${tag}`)
  } else if (found.response.status === 404) {
    const created = await request('/-/releases', {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: target,
        name: releaseName,
        body,
        draft: false,
        prerelease: false,
        make_latest: 'true'
      })
    })
    if (!created.response.ok) fail(`创建 CNB Release 失败：${created.response.status} ${created.text}`)
    release = JSON.parse(created.text)
    console.log(`创建 CNB Release ${tag}`)
  } else {
    fail(`查询 CNB Release 失败：${found.response.status} ${found.text}`)
  }

  for (const path of assets) {
    const name = basename(path)
    const content = readFileSync(path)
    const targetUpload = await request(`/-/releases/${release.id}/asset-upload-url`, {
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

  const page = `https://cnb.cool/${repo}/-/releases/tag/${encodeURIComponent(tag)}`
  console.log(`CNB Release：${page}`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### CNB Release\n\n${page}\n\n`)
  }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
