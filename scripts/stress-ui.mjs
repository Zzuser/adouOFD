#!/usr/bin/env node
/**
 * UI 压力测试：用真实 Electron 打开大文件，滚动到中页/末页、切换目录、滚到末张缩略图，
 * 记录耗时、JS 堆与页面/缩略图 DOM 数量。前置：npm run build 与生成压力夹具。
 * 运行：node scripts/stress-ui.mjs [file1] [file2] ...
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(root, 'desktop')
const electron = join(
  desktop,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
)
const stressDir = join(root, '.tools', 'stress')
const outDir = join(root, '.tools', 'stress')
const explicit = process.argv.slice(2)
const files = explicit.length > 0
  ? explicit
  : readdirSync(stressDir)
    .filter((name) => /\.(pdf|ofd)$/i.test(name))
    .sort()
    .map((name) => join(stressDir, name))

if (files.length === 0) {
  console.error('没有压力测试文件')
  process.exit(1)
}
if (!existsSync(join(desktop, 'out', 'main', 'index.js'))) {
  console.error('请先执行 cd desktop && npm run build')
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const results = []
for (const file of files) {
  if (!existsSync(file)) {
    console.error('文件不存在：', file)
    continue
  }
  console.log(`\n=== ${file} ===`)
  try {
    results.push(await runFile(file))
  } catch (error) {
    console.error('UI 压测失败：', error instanceof Error ? error.message : error)
    results.push({ file: file.split(/[\\/]/).pop(), error: String(error) })
  }
}

const markdown = renderMarkdown(results)
writeFileSync(join(outDir, 'ui-results.md'), markdown, 'utf8')
console.log('\n' + markdown)

async function runFile(file) {
  const port = await freePort()
  const errors = []
  const childEnv = {
    ...process.env,
    ADOU_TEST_OPEN_FILE: file,
    ELECTRON_ENABLE_LOGGING: '0'
  }
  delete childEnv.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
    cwd: desktop,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (data) => process.stdout.write(`[electron] ${data}`))
  child.stderr.on('data', (data) => process.stderr.write(`[electron] ${data}`))

  const timeout = setTimeout(() => {
    console.error('UI 压测超时')
    child.kill()
  }, 5 * 60 * 1000)

  let cdp = null
  try {
    const target = await waitForTarget(port, child)
    cdp = await connect(target.webSocketDebuggerUrl)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    await cdp.send('Log.enable')
    cdp.on('Runtime.exceptionThrown', (params) => errors.push(`exception: ${params.exceptionDetails.text}`))
    cdp.on('Log.entryAdded', (params) => {
      if (params.entry.level === 'error') errors.push(`console: ${params.entry.text}`)
    })

    await waitFor(cdp, "document.querySelector('.engine-mini.ready') !== null", 40_000)
    await evaluate(
      cdp,
      "(() => { const s = document.querySelector('.sidebar'); if (s?.classList.contains('collapsed')) document.querySelector('[data-action=\"sidebar-toggle\"]')?.click(); return true })()"
    )
    await sleep(300)

    const openStarted = Date.now()
    await evaluate(cdp, "document.querySelector('[data-action=\"open\"]')?.click()")
    await waitFor(cdp, "document.querySelector('.doc-name') !== null", 120_000)
    await waitFor(
      cdp,
      "(() => { const img = document.querySelector('.page-slot[data-page=\"1\"] img'); return Boolean(img && img.complete && img.naturalWidth > 0) })()",
      180_000
    )
    const openMs = Date.now() - openStarted

    const name = await evaluate(cdp, "document.querySelector('.doc-name')?.textContent")
    const kind = await evaluate(cdp, "document.querySelector('.format-badge')?.textContent?.trim()")
    const totalText = await evaluate(cdp, "document.querySelector('.page-total')?.textContent")
    const pageCount = Number.parseInt(String(totalText ?? '').replace(/\D/g, ''), 10)
    const slots = await evaluate(cdp, "document.querySelectorAll('.page-slot').length")

    await waitFor(
      cdp,
      "(() => { const img = document.querySelector('.thumb-item[data-page=\"1\"] img'); return Boolean(img && img.complete && img.naturalWidth > 0) })()",
      60_000
    )
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, `ui-${slug(file)}-first.png`), Buffer.from(shot.data, 'base64'))

    const middleStart = Date.now()
    const middle = Math.max(1, Math.ceil(pageCount / 2))
    await scrollToPage(cdp, middle)
    const middleMs = Date.now() - middleStart

    const lastStart = Date.now()
    await scrollToPage(cdp, pageCount)
    const lastMs = Date.now() - lastStart

    const thumbStart = Date.now()
    await evaluate(cdp, "document.querySelector('[data-nav-tab=\"thumbs\"]')?.click()")
    await sleep(200)
    await evaluate(
      cdp,
      "(() => { const list = document.querySelector('.thumb-list'); if (list) list.scrollTop = list.scrollHeight; return true })()"
    )
    await waitFor(
      cdp,
      `(() => { const img = document.querySelector('.thumb-item[data-page="${pageCount}"] img'); return Boolean(img && img.complete && img.naturalWidth > 0) })()`,
      120_000
    )
    const thumbMs = Date.now() - thumbStart
    const thumbs = await evaluate(cdp, "document.querySelectorAll('.thumb-item').length")

    let outlineItems = 0
    let outlineMs = 0
    await evaluate(cdp, "document.querySelector('[data-nav-tab=\"outline\"]')?.click()")
    if (kind === 'PDF') {
      const outlineStart = Date.now()
      await waitFor(
        cdp,
        "document.querySelectorAll('.outline-item').length > 0 || document.querySelector('.nav-empty') !== null",
        30_000
      )
      outlineItems = await evaluate(cdp, "document.querySelectorAll('.outline-item').length")
      outlineMs = Date.now() - outlineStart
    }

    const heapMB = await evaluate(
      cdp,
      "performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 0"
    )

    await evaluate(cdp, "document.querySelector('[data-action=\"close\"]')?.click()")
    await waitFor(cdp, "document.querySelector('.empty') !== null", 30_000)

    return {
      file: file.split(/[\\/]/).pop(),
      name,
      kind,
      pageCount,
      slots,
      thumbs,
      outlineItems,
      openMs,
      middleMs,
      lastMs,
      thumbMs,
      outlineMs,
      heapMB,
      errors: errors.slice(0, 5)
    }
  } finally {
    clearTimeout(timeout)
    if (cdp) {
      await evaluate(cdp, 'setTimeout(() => window.close(), 50); true').catch(() => undefined)
      await sleep(2000)
    }
    if (child.exitCode === null) child.kill()
  }
}

async function scrollToPage(cdp, page) {
  const ok = await evaluate(
    cdp,
    `(() => {
      const root = document.querySelector('.pages-viewport')
      const slot = document.querySelector('.page-slot[data-page="${page}"]')
      if (!root || !slot) return false
      const top = slot.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 26
      root.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
      return true
    })()`
  )
  if (!ok) throw new Error(`找不到第 ${page} 页`)
  await waitFor(cdp, `document.querySelector('.page-input')?.value === '${page}'`, 30_000)
  await waitFor(
    cdp,
    `(() => { const img = document.querySelector('.page-slot[data-page="${page}"] img'); return Boolean(img && img.complete && img.naturalWidth > 0) })()`,
    120_000
  )
}

function renderMarkdown(items) {
  const lines = [
    '# UI 压力测试结果',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '| 文件 | 格式 | 页数 | 页面节点 | 缩略图节点 | 首屏 | 中页 | 末页 | 末张缩略图 | 目录 | JS 堆 | 错误 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'
  ]
  for (const item of items) {
    if (item.error) {
      lines.push(`| ${item.file} | - | - | - | - | - | - | - | - | - | - | ${item.error} |`)
      continue
    }
    lines.push(
      `| ${item.file} | ${item.kind} | ${item.pageCount} | ${item.slots} | ${item.thumbs} | ` +
      `${item.openMs}ms | ${item.middleMs}ms | ${item.lastMs}ms | ${item.thumbMs}ms | ` +
      `${item.outlineItems ? item.outlineItems + '项/' + item.outlineMs + 'ms' : '-'} | ` +
      `${item.heapMB}MB | ${item.errors.length === 0 ? '无' : item.errors.join('；')} |`
    )
  }
  return lines.join('\n') + '\n'
}

async function waitForTarget(port, child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Electron 提前退出（${child.exitCode}）`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find((item) => item.type === 'page')
        if (page) return page
      }
    } catch {
      // 等待调试端口
    }
    await sleep(400)
  }
  throw new Error('等待 CDP 目标超时')
}

function connect(url) {
  return new Promise((resolveConnect, rejectConnect) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    const listeners = new Map()
    let nextId = 1
    socket.addEventListener('open', () => {
      resolveConnect({
        send(method, params = {}) {
          const id = nextId++
          socket.send(JSON.stringify({ id, method, params }))
          return new Promise((resolveSend, rejectSend) => pending.set(id, { resolve: resolveSend, reject: rejectSend }))
        },
        on(method, handler) {
          const list = listeners.get(method) ?? []
          list.push(handler)
          listeners.set(method, list)
        }
      })
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) {
        const entry = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) entry.reject(new Error(message.error.message))
        else entry.resolve(message.result)
        return
      }
      for (const handler of listeners.get(message.method) ?? []) handler(message.params)
    })
    socket.addEventListener('error', () => rejectConnect(new Error('CDP 连接失败')))
  })
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result?.value
}

async function waitFor(cdp, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return
    await sleep(300)
  }
  throw new Error(`等待条件超时：${expression}`)
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

function slug(file) {
  const name = file.split(/[\\/]/).pop() ?? 'file'
  return name.replace(/[^\w.-]+/g, '-')
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}
