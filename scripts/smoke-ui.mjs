#!/usr/bin/env node
/**
 * UI 冒烟：启动生产构建的 Electron，通过 CDP 等待引擎就绪、
 * 打开内置示例、截图，并检查页面渲染与运行时错误。
 *
 * 前置：在 desktop 下执行 npm run build
 * 运行：node scripts/smoke-ui.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(root, 'desktop')
const outDir = join(root, '.tools')
const electronExe = join(
  desktop,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
)

const args = process.argv.slice(2)
const attachIndex = args.indexOf('--attach')
const attachPort = attachIndex >= 0 ? Number(args[attachIndex + 1]) : null
if (attachPort !== null && !Number.isInteger(attachPort)) {
  console.error('--attach 需要指定 CDP 端口，例如 --attach 9223')
  process.exit(1)
}
const debugPort = attachPort ?? (await findFreePort())
const shotPrefix = attachPort ? 'ui-dev' : 'ui'

if (!attachPort) {
  if (!existsSync(join(desktop, 'out', 'main', 'index.js'))) {
    console.error('未找到 desktop/out，请先执行 cd desktop && npm run build')
    process.exit(1)
  }
  if (!existsSync(electronExe)) {
    console.error('未找到 Electron，请先在 desktop 下执行 npm install')
    process.exit(1)
  }
}
mkdirSync(outDir, { recursive: true })

const errors = []
let child = null
if (!attachPort) {
  const childEnv = { ...process.env, ELECTRON_ENABLE_LOGGING: '0' }
  delete childEnv.ELECTRON_RUN_AS_NODE
  child = spawn(electronExe, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: desktop,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (data) => process.stdout.write(`[electron] ${data}`))
  child.stderr.on('data', (data) => process.stderr.write(`[electron] ${data}`))
}

const timeout = setTimeout(async () => {
  console.error('冒烟超时')
  child?.kill()
  process.exit(1)
}, 150_000)

try {
  const target = await waitForTarget()
  console.log('CDP target:', target.url)

  const cdp = await connect(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Log.enable')
  cdp.on('Runtime.exceptionThrown', (params) => {
    errors.push(`exception: ${params.exceptionDetails.text}`)
  })
  cdp.on('Log.entryAdded', (params) => {
    if (params.entry.level === 'error') errors.push(`console: ${params.entry.text}`)
  })

  await waitFor(cdp, "document.querySelector('.engine-mini.ready') !== null", 40_000)
  await sleep(800)
  await evaluate(
    cdp,
    "(() => { const sidebar = document.querySelector('.sidebar'); if (sidebar?.classList.contains('collapsed')) document.querySelector('[data-action=\"sidebar-toggle\"]')?.click(); return true })()"
  )
  await sleep(350)
  const emptyShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-empty.png`), Buffer.from(emptyShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-empty.png`)

  await evaluate(cdp, "document.querySelector('[data-action=\"about\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.about-dialog') !== null", 5_000)
  await sleep(200)
  const aboutVersions = await evaluate(cdp, "document.querySelector('.about-versions')?.innerText")
  console.log('关于/版本：', JSON.stringify(aboutVersions))
  const aboutShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-about.png`), Buffer.from(aboutShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-about.png`)
  await evaluate(cdp, "document.querySelector('.about-close')?.click()")
  await waitFor(cdp, "document.querySelector('.about-dialog') === null", 5_000)
  await sleep(200)

  const security = await evaluate(
    cdp,
    `(() => ({
      requireType: typeof window.require,
      processType: typeof window.process,
      bridgeType: typeof window.adou,
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? '',
      popupBlocked: window.open('about:blank') === null
    }))()`
  )
  console.log('安全基线：', JSON.stringify(security))
  if (security.requireType !== 'undefined' || security.processType !== 'undefined') {
    errors.push('渲染进程仍然暴露 Node 能力')
  }
  if (security.bridgeType !== 'object') {
    errors.push('preload 桥未注入')
  }
  if (!security.popupBlocked) {
    errors.push('window.open 未被拦截')
  }
  if (!String(security.csp).includes('default-src')) {
    errors.push('CSP 未生效')
  }

  await evaluate(cdp, "document.querySelector('[data-action=\"demo-ofd\"]')?.click()")
  await waitFor(
    cdp,
    "document.querySelector('.page-slot[data-page=\"1\"] img.loaded') !== null",
    60_000
  )
  await sleep(500)

  const docName = await evaluate(cdp, "document.querySelector('.doc-name')?.textContent")
  const totalText = await evaluate(cdp, "document.querySelector('.page-total')?.textContent")
  const pageCount = Number.parseInt(String(totalText ?? '').replace(/\D/g, ''), 10)
  const thumbCount = await evaluate(cdp, "document.querySelectorAll('.thumb-item').length")
  console.log('文档：', docName, '页数：', pageCount, '缩略图：', thumbCount)

  if (!docName || !Number.isFinite(pageCount) || pageCount < 2) {
    errors.push('示例文档页数异常')
  }
  if (thumbCount !== pageCount) {
    errors.push(`缩略图数量与页数不一致：${thumbCount} / ${pageCount}`)
  }

  await waitFor(
    cdp,
    "(() => { const img = document.querySelector('.thumb-item[data-page=\"1\"] img'); return Boolean(img && img.complete && img.naturalWidth > 0) })()",
    30_000
  )

  const viewerShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-viewer.png`), Buffer.from(viewerShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-viewer.png`)

  await waitFor(
    cdp,
    "document.querySelectorAll('.page-slot[data-page=\"1\"] .text-run').length > 0",
    30_000
  )
  const selectedOfdText = await evaluate(
    cdp,
    `(() => {
      const runs = Array.from(document.querySelectorAll('.page-slot[data-page="1"] .text-run')).slice(0, 120)
      if (!runs.length) return ''
      const range = document.createRange()
      range.setStartBefore(runs[0])
      range.setEndAfter(runs[runs.length - 1])
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return selection?.toString() ?? ''
    })()`
  )
  console.log('OFD 文字选择：', selectedOfdText.length, JSON.stringify(selectedOfdText.slice(0, 40)))
  if (!selectedOfdText || selectedOfdText.length < 10) {
    errors.push('OFD 文字层无法选中')
  }
  const textShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-text.png`), Buffer.from(textShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-text.png`)
  await evaluate(cdp, "window.getSelection()?.removeAllRanges(); true")

  const dragInfo = await evaluate(
    cdp,
    `(() => {
      const runs = Array.from(document.querySelectorAll('.page-slot[data-page="1"] .text-run'))
      const sheet = document.querySelector('.page-slot[data-page="1"] .page-sheet').getBoundingClientRect()
      const candidates = runs.filter((run) => {
        const rect = run.getBoundingClientRect()
        return Math.abs(rect.left - (sheet.left + 100)) < 12 && rect.top > sheet.top + sheet.height * 0.3
      })
      const run = candidates[0] ?? runs[Math.floor(runs.length / 2)]
      const rect = run.getBoundingClientRect()
      return {
        left: rect.left, top: rect.top, height: rect.height,
        sheetRight: sheet.right, sheetBottom: sheet.bottom
      }
    })()`
  )
  await dragMouse(cdp, dragInfo.left + 2, dragInfo.top + dragInfo.height / 2,
    dragInfo.left + 160, dragInfo.top + dragInfo.height / 2)
  const normalDragLength = await evaluate(
    cdp,
    "window.getSelection()?.toString().length ?? 0"
  )
  console.log('鼠标拖选长度：', normalDragLength)
  if (!normalDragLength || normalDragLength > 500) {
    errors.push('正常鼠标拖选异常')
  }
  await evaluate(cdp, "window.getSelection()?.removeAllRanges(); true")

  await dragMouse(cdp, dragInfo.left + 2, dragInfo.top + dragInfo.height / 2,
    dragInfo.sheetRight + 30, dragInfo.top + dragInfo.height / 2)
  const overshootLength = await evaluate(
    cdp,
    "window.getSelection()?.toString().length ?? 0"
  )
  console.log('越界拖选长度（应被钳制）：', overshootLength)
  if (overshootLength > 200) {
    errors.push('拖出页面后选区未被钳制')
  }
  await evaluate(cdp, "window.getSelection()?.removeAllRanges(); true")

  const zoomBefore = await evaluate(cdp, "document.querySelector('.zoom-value')?.textContent?.trim()")
  await evaluate(cdp, "document.querySelector('.zoom-in')?.click()")
  await sleep(600)
  const zoomAfter = await evaluate(cdp, "document.querySelector('.zoom-value')?.textContent?.trim()")
  console.log('缩放：', zoomBefore, '→', zoomAfter)
  if (!zoomBefore || !zoomAfter || zoomBefore === zoomAfter) {
    errors.push('缩放按钮未生效')
  }
  await evaluate(
    cdp,
    "document.querySelector('.zoom-dock .dock-btn[title=\"适合宽度\"]')?.click()"
  )
  await sleep(500)

  const fitWidthZoom = await evaluate(cdp, "document.querySelector('.zoom-value')?.textContent?.trim()")
  await evaluate(
    cdp,
    "document.querySelector('.zoom-dock .dock-btn[title=\"适合页面\"]')?.click()"
  )
  await sleep(500)
  const fitPageZoom = await evaluate(cdp, "document.querySelector('.zoom-value')?.textContent?.trim()")
  console.log('适合页面：', fitWidthZoom, '→', fitPageZoom)
  if (!fitWidthZoom || !fitPageZoom || Number.parseFloat(fitPageZoom) >= Number.parseFloat(fitWidthZoom)) {
    errors.push('适合页面缩放未生效')
  }
  await evaluate(
    cdp,
    "document.querySelector('.zoom-dock .dock-btn[title=\"适合宽度\"]')?.click()"
  )
  await sleep(400)

  const wheelBefore = await evaluate(cdp, "document.querySelector('.zoom-value')?.textContent?.trim()")
  await evaluate(
    cdp,
    "document.querySelector('.pages-viewport')?.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true }))"
  )
  await sleep(500)
  const wheelAfter = await evaluate(cdp, "document.querySelector('.zoom-value')?.textContent?.trim()")
  console.log('Ctrl+滚轮：', wheelBefore, '→', wheelAfter)
  if (!wheelBefore || !wheelAfter || wheelBefore === wheelAfter) {
    errors.push('Ctrl+滚轮缩放未生效')
  }
  await evaluate(
    cdp,
    "document.querySelector('.zoom-dock .dock-btn[title=\"适合宽度\"]')?.click()"
  )
  await sleep(500)

  await evaluate(cdp, "document.querySelector('.zoom-value')?.click()")
  await sleep(200)
  await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.zoom-popover button')).find((button) => button.textContent?.trim() === '200%')?.click()"
  )
  await sleep(700)
  const zoomMetrics = await evaluate(
    cdp,
    `(() => {
      const view = document.querySelector('.pages-viewport')
      const slot = document.querySelector('.page-slot')
      return {
        zoom: document.querySelector('.zoom-value')?.textContent?.trim(),
        clientWidth: view ? view.clientWidth : null,
        scrollWidth: view ? view.scrollWidth : null,
        slotWidth: slot ? Math.round(slot.getBoundingClientRect().width) : null
      }
    })()`
  )
  console.log('200% 指标：', JSON.stringify(zoomMetrics))
  const horizontalScroll = Boolean(
    zoomMetrics.scrollWidth && zoomMetrics.clientWidth &&
    zoomMetrics.scrollWidth > zoomMetrics.clientWidth + 20
  )
  console.log('200% 水平滚动：', horizontalScroll)
  if (!horizontalScroll || zoomMetrics.zoom !== '200%') {
    errors.push('高倍缩放未产生水平滚动或比例未生效')
  }
  await evaluate(
    cdp,
    "document.querySelector('.zoom-dock .dock-btn[title=\"适合宽度\"]')?.click()"
  )
  await sleep(500)

  await evaluate(cdp, "document.querySelector('.page-nav button:last-of-type')?.click()")
  await waitFor(cdp, "document.querySelector('.page-input')?.value === '2'", 15_000)
  await waitFor(
    cdp,
    "(() => { const root = document.querySelector('.pages-viewport'); const slot = document.querySelector('.page-slot[data-page=\"2\"]'); if (!root || !slot) return false; return Math.abs(slot.getBoundingClientRect().top - root.getBoundingClientRect().top) < 90 })()",
    20_000
  )
  await waitFor(
    cdp,
    "document.querySelector('.thumb-item.active .thumb-label')?.textContent === '2'",
    15_000
  )
  try {
    await waitFor(
      cdp,
      "document.querySelector('.page-slot[data-page=\"2\"] img.loaded') !== null",
      60_000
    )
  } catch (error) {
    const dump = await evaluate(
      cdp,
      `Array.from(document.querySelectorAll('.page-slot')).map((slot) => {
        const img = slot.querySelector('img')
        return {
          page: slot.dataset.page,
          hasImage: Boolean(img),
          complete: img ? img.complete : null,
          naturalWidth: img ? img.naturalWidth : null,
          classes: img ? img.className : null,
          placeholder: Boolean(slot.querySelector('.page-placeholder')),
          loading: Boolean(slot.querySelector('.page-loading')),
          failed: Boolean(slot.querySelector('.page-error'))
        }
      })`
    )
    console.error('页面状态：', JSON.stringify(dump))
    throw error
  }
  const secondPage = await evaluate(cdp, "document.querySelector('.page-input')?.value")
  console.log('翻页：', secondPage)
  const page2Shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-page2.png`), Buffer.from(page2Shot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-page2.png`)

  if (pageCount > 2) {
    await evaluate(cdp, "document.querySelector('.thumb-item[data-page=\"3\"]')?.click()")
    await waitFor(cdp, "document.querySelector('.page-input')?.value === '3'", 15_000)
    await waitFor(
      cdp,
      "(() => { const img = document.querySelector('.page-slot[data-page=\"3\"] img'); return Boolean(img && img.complete && img.naturalWidth > 0) })()",
      30_000
    )
    console.log('缩略图跳页：3')
  }

  if (!docName || !secondPage) {
    errors.push('未获取到文档标题或页码')
  }

  await evaluate(cdp, "document.querySelector('[data-action=\"close\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.empty') !== null", 15_000)
  await evaluate(cdp, "document.querySelector('[data-action=\"demo-pdf\"]')?.click()")
  await waitFor(
    cdp,
    "document.querySelector('.format-badge')?.textContent?.trim() === 'PDF'",
    30_000
  )
  await waitFor(
    cdp,
    "document.querySelector('.page-slot[data-page=\"1\"] img.loaded') !== null",
    60_000
  )
  await waitFor(
    cdp,
    "(() => { const img = document.querySelector('.thumb-item[data-page=\"1\"] img'); return Boolean(img && img.complete && img.naturalWidth > 0) })()",
    30_000
  )

  await waitFor(
    cdp,
    "document.querySelectorAll('.page-slot[data-page=\"1\"] .text-run').length > 0",
    30_000
  )
  const selectedPdfText = await evaluate(
    cdp,
    `(() => {
      const runs = Array.from(document.querySelectorAll('.page-slot[data-page="1"] .text-run')).slice(0, 120)
      if (!runs.length) return ''
      const range = document.createRange()
      range.setStartBefore(runs[0])
      range.setEndAfter(runs[runs.length - 1])
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return selection?.toString() ?? ''
    })()`
  )
  console.log('PDF 文字选择：', selectedPdfText.length, JSON.stringify(selectedPdfText.slice(0, 40)))
  if (!selectedPdfText || selectedPdfText.length < 10) {
    errors.push('PDF 文字层无法选中')
  }
  const pdfTextShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-pdf-text.png`), Buffer.from(pdfTextShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-pdf-text.png`)
  await evaluate(cdp, "window.getSelection()?.removeAllRanges(); true")

  const pdfName = await evaluate(cdp, "document.querySelector('.doc-name')?.textContent")
  const pdfTotalText = await evaluate(cdp, "document.querySelector('.page-total')?.textContent")
  const pdfPages = Number.parseInt(String(pdfTotalText ?? '').replace(/\D/g, ''), 10)
  const pdfThumbs = await evaluate(cdp, "document.querySelectorAll('.thumb-item').length")
  console.log('PDF：', pdfName, '页数：', pdfPages, '缩略图：', pdfThumbs)
  if (!pdfName || !Number.isFinite(pdfPages) || pdfPages < 2) {
    errors.push('PDF 示例页数异常')
  }
  if (pdfThumbs !== pdfPages) {
    errors.push(`PDF 缩略图数量与页数不一致：${pdfThumbs} / ${pdfPages}`)
  }

  const pdfShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-pdf.png`), Buffer.from(pdfShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-pdf.png`)

  await evaluate(cdp, "document.querySelector('.page-nav button:last-of-type')?.click()")
  await waitFor(cdp, "document.querySelector('.page-input')?.value === '2'", 15_000)
  await waitFor(
    cdp,
    "(() => { const root = document.querySelector('.pages-viewport'); const slot = document.querySelector('.page-slot[data-page=\"2\"]'); if (!root || !slot) return false; return Math.abs(slot.getBoundingClientRect().top - root.getBoundingClientRect().top) < 90 })()",
    20_000
  )
  await waitFor(
    cdp,
    "(() => { const img = document.querySelector('.page-slot[data-page=\"2\"] img'); return Boolean(img && img.complete && img.naturalWidth > 0) })()",
    30_000
  )
  console.log('PDF 翻页：2')

  await evaluate(cdp, "document.querySelector('[data-nav-tab=\"outline\"]')?.click()")
  await waitFor(cdp, "document.querySelectorAll('.outline-item').length >= 3", 15_000)
  const outlineCount = await evaluate(cdp, "document.querySelectorAll('.outline-item').length")
  const outlineActive = await evaluate(
    cdp,
    "document.querySelector('.outline-item.active')?.textContent?.trim()"
  )
  console.log('PDF 目录：', outlineCount, '项，当前：', outlineActive)
  if (!outlineCount || outlineCount < 3) {
    errors.push('PDF 目录未正确加载')
  }
  const outlineShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-outline.png`), Buffer.from(outlineShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-outline.png`)

  await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.outline-item')).at(-1)?.click()"
  )
  await waitFor(cdp, "document.querySelector('.page-input')?.value === '3'", 15_000)
  await waitFor(
    cdp,
    "(() => { const img = document.querySelector('.page-slot[data-page=\"3\"] img'); return Boolean(img && img.complete && img.naturalWidth > 0) })()",
    30_000
  )
  console.log('目录跳页：3')

  await evaluate(cdp, "document.querySelector('[data-action=\"close\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.empty') !== null", 15_000)

  await evaluate(cdp, "document.querySelector('[data-action=\"sidebar-toggle\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.sidebar')?.classList.contains('collapsed')", 5_000)
  await sleep(350)
  const collapsedWidth = await evaluate(
    cdp,
    "Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0)"
  )
  console.log('侧栏折叠宽度：', collapsedWidth)
  if (!collapsedWidth || collapsedWidth >= 120) {
    errors.push('应用侧栏折叠未生效')
  }
  const collapsedShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-collapsed.png`), Buffer.from(collapsedShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-collapsed.png`)
  await evaluate(cdp, "document.querySelector('[data-action=\"sidebar-toggle\"]')?.click()")
  await waitFor(
    cdp,
    "!document.querySelector('.sidebar')?.classList.contains('collapsed')",
    5_000
  )
  await sleep(350)
  const expandedWidth = await evaluate(
    cdp,
    "Math.round(document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0)"
  )
  console.log('侧栏展开宽度：', expandedWidth)
  if (!expandedWidth || expandedWidth < 200) {
    errors.push('应用侧栏展开未恢复')
  }

  await evaluate(cdp, 'setTimeout(() => window.close(), 50); true')
  await sleep(2500)

  if (errors.length > 0) {
    console.error('运行时错误：')
    for (const error of errors) console.error('-', error)
    process.exitCode = 1
  } else {
    console.log('UI 冒烟通过，无渲染进程运行时错误')
  }
} catch (error) {
  console.error('冒烟失败：', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  clearTimeout(timeout)
  await sleep(500)
  if (child && child.exitCode === null) {
    child.kill()
  }
}

async function dragMouse(cdp, x1, y1, x2, y2) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1
  })
  for (let step = 1; step <= 8; step++) {
    const x = x1 + ((x2 - x1) * step) / 8
    const y = y1 + ((y2 - y1) * step) / 8
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x, y, button: 'left', buttons: 1
    })
    await sleep(20)
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1
  })
  await sleep(200)
}

async function waitForTarget() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`Electron 提前退出，代码 ${child.exitCode}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find((item) => item.type === 'page')
        if (page) return page
      }
    } catch {
      // 等待调试端口就绪
    }
    await sleep(400)
  }
  throw new Error('等待 CDP 目标超时')
}

function findFreePort() {
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
          return new Promise((resolveSend, rejectSend) => {
            pending.set(id, { resolve: resolveSend, reject: rejectSend })
          })
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
        if (message.error) {
          entry.reject(new Error(message.error.message))
        } else {
          entry.resolve(message.result)
        }
        return
      }
      for (const handler of listeners.get(message.method) ?? []) {
        handler(message.params)
      }
    })
    socket.addEventListener('error', () => rejectConnect(new Error('CDP WebSocket 连接失败')))
  })
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text)
  }
  return result.result?.value
}

async function waitFor(cdp, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return
    await sleep(350)
  }
  throw new Error(`等待条件超时：${expression}`)
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}
