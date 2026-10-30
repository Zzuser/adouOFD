#!/usr/bin/env node
/**
 * 后端压力测试：启动真实 jar，逐个打开大文件，测量打开、目录、首/中/末页渲染耗时与进程内存。
 * 运行：node scripts/stress-backend.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const backendDir = join(root, 'backend')
const jar = join(backendDir, 'target', 'adou-ofd-backend.jar')
const java = join(root, '.tools', 'jdk-25', 'bin', 'java.exe')
const stressDir = join(root, '.tools', 'stress')

if (!existsSync(jar) || !existsSync(java)) {
  console.error('缺少 jar 或 JDK，请先运行 npm run backend:build')
  process.exit(1)
}
if (!existsSync(stressDir)) {
  console.error('缺少 .tools/stress，请先用 StressFixtureGenerator 生成夹具')
  process.exit(1)
}

const files = readdirSync(stressDir)
  .filter((name) => /\.(pdf|ofd)$/i.test(name))
  .sort()
  .map((name) => join(stressDir, name))
if (files.length === 0) {
  console.error('没有可测试的大文件')
  process.exit(1)
}

const port = await freePort()
const token = randomBytes(16).toString('hex')
const base = `http://127.0.0.1:${port}/api`
const headers = { 'X-ADou-Token': token, 'Content-Type': 'application/json' }
const child = spawn(java, [
  '-Djava.awt.headless=true',
  '-Xms64m',
  '-Xmx768m',
  '-Xss2m',
  '-jar',
  jar,
  `--server.port=${port}`,
  `--adou.token=${token}`,
  '--spring.main.banner-mode=off',
  '--logging.level.root=WARN'
], { cwd: backendDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

let logTail = ''
child.stdout.on('data', (data) => { logTail = (logTail + data).slice(-4000) })
child.stderr.on('data', (data) => { logTail = (logTail + data).slice(-4000) })

const timeout = setTimeout(() => {
  console.error('压测超时')
  child.kill()
  process.exit(1)
}, 10 * 60 * 1000)

const results = []
try {
  await waitHealth()
  console.log(`引擎就绪 port=${port} pid=${child.pid}`)
  for (const file of files) {
    results.push(await stressFile(file))
  }
} catch (error) {
  console.error('压测失败：', error instanceof Error ? error.message : error)
  console.error(logTail.split('\n').slice(-15).join('\n'))
  process.exitCode = 1
} finally {
  clearTimeout(timeout)
  try {
    await fetch(`${base}/system/shutdown`, { method: 'POST', headers, signal: AbortSignal.timeout(2000) })
  } catch {
    child.kill()
  }
}

if (results.length > 0) {
  const markdown = renderMarkdown(results)
  mkdirSync(stressDir, { recursive: true })
  writeFileSync(join(stressDir, 'backend-results.md'), markdown, 'utf8')
  console.log('\n' + markdown)
}

async function stressFile(file) {
  const name = file.split(/[\\/]/).pop()
  const result = { name, sizeMB: (fileSize(file) / 1024 / 1024).toFixed(1) }
  const openStarted = Date.now()
  const openResponse = await fetch(`${base}/documents/open`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ path: file.replaceAll('\\', '/') }),
    signal: AbortSignal.timeout(120_000)
  })
  const summary = await openResponse.json()
  if (!openResponse.ok) {
    result.error = summary.message ?? `HTTP ${openResponse.status}`
    console.log(`✗ ${name}: ${result.error}`)
    return result
  }
  result.kind = summary.kind
  result.pages = summary.pageCount
  result.openMs = Date.now() - openStarted

  const outlineStarted = Date.now()
  const outlineResponse = await fetch(`${base}/documents/${summary.id}/outline`, {
    headers,
    signal: AbortSignal.timeout(120_000)
  })
  const outline = await outlineResponse.json()
  result.outlineMs = Date.now() - outlineStarted
  result.outlineItems = Array.isArray(outline) ? outline.length : 0

  const pages = [1, Math.max(1, Math.ceil(summary.pageCount / 2)), summary.pageCount]
  result.renders = []
  result.texts = []
  for (const page of [...new Set(pages)]) {
    for (const dpi of [96, 24]) {
      const started = Date.now()
      try {
        const response = await fetch(
          `${base}/documents/${summary.id}/pages/${page}?dpi=${dpi}&token=${token}`,
          { signal: AbortSignal.timeout(180_000) }
        )
        const buffer = Buffer.from(await response.arrayBuffer())
        result.renders.push({ page, dpi, ms: Date.now() - started, bytes: buffer.length, ok: response.ok })
      } catch (error) {
        result.renders.push({ page, dpi, ms: Date.now() - started, bytes: 0, ok: false,
          error: error instanceof Error ? error.name : String(error) })
      }
    }

    const textStarted = Date.now()
    try {
      const response = await fetch(
        `${base}/documents/${summary.id}/pages/${page}/text`,
        { headers, signal: AbortSignal.timeout(180_000) }
      )
      const runs = await response.json()
      result.texts.push({ page, ms: Date.now() - textStarted, count: Array.isArray(runs) ? runs.length : 0, ok: response.ok })
    } catch (error) {
      result.texts.push({ page, ms: Date.now() - textStarted, count: 0, ok: false,
        error: error instanceof Error ? error.name : String(error) })
    }
  }

  result.rssMB = Math.round(processRss(child.pid) / 1024)
  await fetch(`${base}/documents/${summary.id}`, { method: 'DELETE', headers })
  console.log(`✓ ${name}: ${summary.kind} ${summary.pageCount} 页, open=${result.openMs}ms, outline=${result.outlineItems}, rss=${result.rssMB}MB`)
  return result
}

function renderMarkdown(results) {
  const lines = [
    '# 后端压力测试结果',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '| 文件 | 大小 | 格式 | 页数 | 打开 | 目录 | 首/中/末页 96DPI | 首/中/末页 24DPI | 首/中/末页文字层 | RSS |',
    '| --- | ---: | --- | ---: | ---: | ---: | --- | --- | --- | ---: |'
  ]
  for (const item of results) {
    if (item.error) {
      lines.push(`| ${item.name} | ${item.sizeMB}MB | - | - | - | - | - | - | - |`)
      continue
    }
    const pick = (dpi) => item.renders
      .filter((render) => render.dpi === dpi)
      .map((render) => `${render.page}:${render.ms}ms${render.ok ? '' : '(失败)'}`)
      .join(' / ')
    lines.push(
      `| ${item.name} | ${item.sizeMB}MB | ${item.kind} | ${item.pages} | ${item.openMs}ms | ` +
      `${item.outlineItems}项/${item.outlineMs}ms | ${pick(96)} | ${pick(24)} | ` +
      `${item.texts.map((text) => `${text.page}:${text.ms}ms/${text.count}行`).join(' / ')} | ${item.rssMB}MB |`
    )
  }
  return lines.join('\n') + '\n'
}

function fileSize(file) {
  return statSync(file).size
}

function processRss(pid) {
  const output = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
    encoding: 'utf8'
  }).stdout
  const match = output.match(/"([\d,]+) K"/)
  return match ? Number(match[1].replaceAll(',', '')) : 0
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.unref()
    server.on('error', rejectPort)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolvePort(port))
    })
  })
}

async function waitHealth() {
  const deadline = Date.now() + 40_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers,
        signal: AbortSignal.timeout(1000)
      })
      if (response.ok) return
    } catch {
      // 等待引擎就绪
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300))
  }
  throw new Error('引擎启动超时')
}
