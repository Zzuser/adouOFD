#!/usr/bin/env node
/**
 * UI 冒烟：启动生产构建的 Electron，通过 CDP 等待引擎就绪、
 * 打开内置示例、截图，并检查页面渲染与运行时错误。
 *
 * 前置：在 desktop 下执行 npm run build
 * 运行：node scripts/smoke-ui.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
const convertOutput = join(outDir, 'smoke-convert.ofd')
rmSync(convertOutput, { force: true })
const batchInputsFile = join(outDir, 'smoke-batch-inputs.txt')
const batchOutDir = join(outDir, 'smoke-batch')
rmSync(batchInputsFile, { force: true })
rmSync(batchOutDir, { recursive: true, force: true })
const mergeOutput = join(outDir, 'smoke-merge.ofd')
rmSync(mergeOutput, { force: true })

const errors = []
let child = null
if (!attachPort) {
  const childEnv = {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '0',
    ADOU_TEST_SAVE_FILE: convertOutput,
    ADOU_TEST_OPEN_FILES: batchInputsFile,
    ADOU_TEST_OUTPUT_DIR: batchOutDir,
    ADOU_TEST_MERGE_FILE: mergeOutput
  }
  delete childEnv.ELECTRON_RUN_AS_NODE
  // 无 GPU 的虚拟机/远程桌面下 Chromium GPU 进程会崩溃，可用 ADOU_SMOKE_GPU_OFF=1 降级
  const launchArgs = ['.', `--remote-debugging-port=${debugPort}`]
  if (process.env.ADOU_SMOKE_GPU_OFF === '1') {
    launchArgs.push('--disable-gpu', '--in-process-gpu', '--no-sandbox')
  }
  child = spawn(electronExe, launchArgs, {
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
    if (params.entry.level === 'error') {
      errors.push(`console: ${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ''}`)
    }
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
  const aboutLicenses = await evaluate(
    cdp,
    "document.querySelector('.about-licenses')?.innerText.replace(/\\n/g, ' | ')"
  )
  console.log('关于/许可：', JSON.stringify(aboutLicenses))
  if (!String(aboutLicenses).includes('开源许可') || !String(aboutLicenses).includes('Electron')) {
    errors.push('关于页开源许可区未正确显示')
  }
  await waitFor(
    cdp,
    "(() => { const button = document.querySelector('[data-action=\"view-third-party\"]'); return Boolean(button && !button.disabled) })()",
    10_000
  )
  await evaluate(cdp, "document.querySelector('[data-action=\"view-third-party\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.license-dialog') !== null", 10_000)
  await sleep(350)
  const licenseText = await evaluate(cdp, "document.querySelector('.license-text')?.innerText")
  console.log('第三方声明长度：', String(licenseText ?? '').length)
  if (!String(licenseText).includes('第三方组件') || !String(licenseText).includes('Apache')) {
    errors.push('第三方许可声明未加载')
  }
  const licenseShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-license.png`), Buffer.from(licenseShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-license.png`)
  await evaluate(cdp, "document.querySelector('[data-action=\"license-close\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.license-dialog') === null", 5_000)
  const aboutShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-about.png`), Buffer.from(aboutShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-about.png`)
  await evaluate(cdp, "document.querySelector('.about-close')?.click()")
  await waitFor(cdp, "document.querySelector('.about-dialog') === null", 5_000)
  await sleep(200)

  await evaluate(cdp, "document.querySelector('[data-action=\"nav-settings\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.settings-page') !== null", 5_000)
  const settingsTitle = await evaluate(cdp, "document.querySelector('.topbar-title h1')?.textContent")
  const integrationText = await evaluate(
    cdp,
    "document.querySelector('.integration-panel')?.innerText.replace(/\\n/g, ' | ')"
  )
  console.log('设置页：', settingsTitle, JSON.stringify(integrationText))
  if (settingsTitle !== '设置') {
    errors.push('设置页未打开')
  }
  if (!String(integrationText).includes('开发模式')) {
    errors.push('设置页 Windows 文件关联未显示开发模式')
  }
  const settingsShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-settings.png`), Buffer.from(settingsShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-settings.png`)
  await evaluate(cdp, "document.querySelector('[data-action=\"nav-viewer\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.main')?.dataset.view === 'viewer'", 5_000)

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
    "document.querySelector('.viewer-pane:not([hidden]) .page-slot[data-page=\"1\"] img.loaded') !== null",
    60_000
  )
  await sleep(500)

  const docName = await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) .doc-name')?.textContent")
  const totalText = await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) .page-total')?.textContent")
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

  // ---- 全文搜索 ----
  await evaluate(cdp, "document.querySelector('[data-action=\"search\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.search-bar') !== null", 5_000)
  const setSearchValue = async (value) => {
    const ok = await evaluate(
      cdp,
      `(() => {
        const input = document.querySelector('.viewer-pane:not([hidden]) .search-input')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(value)})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`
    )
    if (!ok) errors.push('搜索输入框不可用')
  }

  await setSearchValue('仅用于功能演示')
  await waitFor(
    cdp,
    "document.querySelector('.search-status')?.textContent?.includes('找到 1 处')",
    30_000
  )
  await waitFor(cdp, "document.querySelectorAll('.search-row').length === 1", 15_000)
  await waitFor(cdp, "document.querySelector('.page-input')?.value === '4'", 15_000)
  await waitFor(
    cdp,
    "document.querySelector('.page-slot[data-page=\"4\"] .search-hit.active') !== null",
    30_000
  )
  const searchSnippet = await evaluate(
    cdp,
    "document.querySelector('.search-row')?.innerText?.replace(/\\n/g, ' ')"
  )
  console.log('全文搜索（唯一命中）：', searchSnippet)
  const searchShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-search.png`), Buffer.from(searchShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-search.png`)

  await setSearchValue('阿豆OFD')
  await waitFor(
    cdp,
    "(() => { const text = document.querySelector('.search-status')?.textContent ?? ''; return text.includes('找到') && Number.parseInt(text.replace(/\\D/g, ''), 10) > 1 })()",
    30_000
  )
  await waitFor(cdp, "document.querySelectorAll('.search-row').length > 3", 15_000)
  await waitFor(cdp, "document.querySelector('.page-input')?.value === '1'", 15_000)
  await evaluate(cdp, "document.querySelector('[data-action=\"search-next\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.search-index')?.textContent?.startsWith('2/')", 10_000)
  const searchState = await evaluate(
    cdp,
    `(() => ({
      status: document.querySelector('.search-status')?.textContent?.trim(),
      index: document.querySelector('.search-index')?.textContent?.trim(),
      rows: document.querySelectorAll('.search-row').length,
      activeRows: document.querySelectorAll('.search-row.active').length,
      marks: document.querySelectorAll('.search-hit').length,
      activeMarks: document.querySelectorAll('.search-hit.active').length
    }))()`
  )
  console.log('全文搜索（多命中）：', JSON.stringify(searchState))
  if (searchState.activeRows !== 1) {
    errors.push('搜索结果当前项未唯一高亮')
  }
  if (searchState.marks < 1 || searchState.activeMarks < 1) {
    errors.push('页面内搜索命中未高亮')
  }
  await evaluate(cdp, "document.querySelector('[data-action=\"search-close\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.search-bar') === null", 5_000)
  await waitFor(cdp, "document.querySelectorAll('.search-hit').length === 0", 5_000)

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
    "document.querySelector('.viewer-pane:not([hidden]) .page-slot[data-page=\"1\"] img.loaded') !== null",
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

  const pdfName = await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) .doc-name')?.textContent")
  const pdfTotalText = await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) .page-total')?.textContent")
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

  // ---- PDF → OFD 转换（真实引擎 + 保存对话框测试钩子） ----
  await evaluate(cdp, "document.querySelector('[data-action=\"convert\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.convert-dialog') !== null", 5_000)
  await sleep(300)
  const convertTarget = await evaluate(
    cdp,
    "document.querySelector('.convert-card.target .convert-name')?.textContent?.trim()"
  )
  console.log('转换目标格式：', convertTarget)
  if (convertTarget !== 'OFD') {
    errors.push('转换对话框未按源格式推荐目标格式')
  }
  const convertShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-convert.png`), Buffer.from(convertShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-convert.png`)

  await evaluate(cdp, "document.querySelector('.convert-actions .btn.primary')?.click()")
  await waitFor(cdp, "document.querySelector('.convert-result') !== null", 120_000)
  const convertReport = await evaluate(cdp, "document.querySelector('.convert-result')?.innerText")
  const convertSaved = await evaluate(
    cdp,
    "document.querySelector('.convert-saved')?.textContent?.trim()"
  )
  console.log('转换结果：', JSON.stringify(convertReport))
  console.log('转换输出：', convertSaved)
  if (!convertSaved || !convertSaved.toLowerCase().endsWith('.ofd')) {
    errors.push('转换输出路径异常')
  }
  if (!existsSync(convertOutput)) {
    errors.push('转换未生成输出文件')
  } else {
    console.log('转换输出体积：', statSync(convertOutput).size)
  }
  const convertDoneShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-convert-done.png`), Buffer.from(convertDoneShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-convert-done.png`)
  await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.convert-actions button')).find((button) => button.textContent?.trim() === '关闭')?.click()"
  )
  await waitFor(cdp, "document.querySelector('.convert-dialog') === null", 5_000)

  // ---- 单实例 / 命令行打开（模拟文件关联双击） ----
  const secondEnv = { ...process.env }
  delete secondEnv.ELECTRON_RUN_AS_NODE
  const secondInstance = spawn(electronExe, ['.', convertOutput], {
    cwd: desktop,
    env: secondEnv,
    stdio: 'ignore'
  })
  await new Promise((resolve) => secondInstance.once('exit', resolve))
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 2", 30_000)
  await waitFor(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) .doc-name')?.textContent?.includes('smoke-convert')",
    30_000
  )
  console.log('命令行打开：第二实例已并入当前窗口（2 个标签）')
  await evaluate(
    cdp,
    "document.querySelector('.doc-tab.active [data-action=\"doc-tab-close\"]')?.click()"
  )
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 1", 15_000)
  await waitFor(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) .format-badge')?.textContent?.trim() === 'PDF'",
    10_000
  )

  // ---- 批量转换标签页 ----
  const batchInputs = await evaluate(
    cdp,
    `(async () => {
      const info = await window.adou.getBackendInfo()
      const headers = { 'X-ADou-Token': info.token, 'Content-Type': 'application/json' }
      const call = async (path) => (await fetch('http://127.0.0.1:' + info.port + path, { method: 'POST', headers })).json()
      const ofd = await call('/api/documents/demo')
      const pdf = await call('/api/documents/demo/pdf')
      return [ofd.path, pdf.path]
    })()`
  )
  writeFileSync(batchInputsFile, batchInputs.join('\n'), 'utf8')

  await evaluate(cdp, "document.querySelector('[data-action=\"nav-batch\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.batch-drop') !== null", 5_000)
  const batchTitle = await evaluate(cdp, "document.querySelector('.topbar-title h1')?.textContent")
  if (batchTitle !== '批量转换') {
    errors.push('批量转换标签页未打开')
  }

  await evaluate(cdp, "document.querySelector('[data-action=\"batch-add\"]')?.click()")
  await waitFor(cdp, "document.querySelectorAll('.batch-row').length === 2", 30_000)
  await waitFor(
    cdp,
    "document.querySelectorAll('.batch-row[data-batch-row=\"pending\"]').length === 2",
    30_000
  )
  const batchMeta = await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.batch-row')).map((row) => row.innerText.replace(/\\n/g, ' | '))"
  )
  console.log('批量文件：', JSON.stringify(batchMeta))

  await evaluate(cdp, "document.querySelector('[data-action=\"batch-output\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.batch-dir')?.textContent?.includes('smoke-batch')", 5_000)

  await evaluate(cdp, "document.querySelector('[data-action=\"batch-start\"]')?.click()")
  await waitFor(
    cdp,
    "document.querySelectorAll('.batch-row[data-batch-row=\"done\"]').length === 2",
    120_000
  )
  const batchSummary = await evaluate(
    cdp,
    "document.querySelector('.batch-summary')?.innerText.replace(/\\n/g, ' ')"
  )
  console.log('批量汇总：', batchSummary)
  const batchShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-batch.png`), Buffer.from(batchShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-batch.png`)

  const batchFiles = existsSync(batchOutDir) ? readdirSync(batchOutDir) : []
  console.log('批量输出：', batchFiles.join(', '))
  if (batchFiles.length !== 2) {
    errors.push(`批量转换输出数量异常：${batchFiles.length}`)
  }

  // ---- 批量列表“查看” + 多标签 ----
  await evaluate(
    cdp,
    "document.querySelector('[data-action=\"batch-view\"]')?.click()"
  )
  await waitFor(cdp, "document.querySelector('.main')?.dataset.view === 'viewer'", 10_000)
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 2", 15_000)
  const batchViewName = await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) .doc-name')?.textContent")
  console.log('批量查看结果：', batchViewName)
  if (!String(batchViewName).includes('示例文档.pdf')) {
    errors.push('批量列表查看按钮未打开转换结果')
  }
  await evaluate(
    cdp,
    "document.querySelectorAll('.doc-tab')[0]?.querySelector('[data-action=\"doc-tab\"]')?.click()"
  )
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .doc-name')?.textContent?.includes('PDF示例.pdf')", 10_000)
  await evaluate(
    cdp,
    "document.querySelectorAll('.doc-tab')[1]?.querySelector('[data-action=\"doc-tab\"]')?.click()"
  )
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .doc-name')?.textContent?.includes('示例文档.pdf')", 10_000)
  console.log('标签切换：2 个标签正常')
  const tabsShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-tabs.png`), Buffer.from(tabsShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-tabs.png`)
  await evaluate(cdp, "document.querySelector('[data-action=\"nav-batch\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.batch-list') !== null", 5_000)

  // ---- 合并标签页 ----
  await evaluate(cdp, "document.querySelector('[data-action=\"nav-merge\"]')?.click()")
  await waitFor(cdp, "document.querySelector('[data-action=\"merge-add\"]') !== null", 5_000)
  const mergeTitle = await evaluate(cdp, "document.querySelector('.topbar-title h1')?.textContent")
  if (mergeTitle !== '合并文档') {
    errors.push('合并标签页未打开')
  }

  await evaluate(cdp, "document.querySelector('[data-action=\"merge-add\"]')?.click()")
  await waitFor(
    cdp,
    "document.querySelectorAll('.merge-row[data-merge-row=\"ready\"]').length === 2",
    30_000
  )
  const mergeOrderBefore = await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.merge-row .batch-name')).map((node) => node.textContent)"
  )
  await evaluate(
    cdp,
    "document.querySelector('[data-merge-index=\"0\"] [data-action=\"merge-down\"]')?.click()"
  )
  await sleep(250)
  const mergeOrderAfter = await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.merge-row .batch-name')).map((node) => node.textContent)"
  )
  console.log('合并顺序：', JSON.stringify(mergeOrderBefore), '→', JSON.stringify(mergeOrderAfter))
  if (
    mergeOrderBefore.length !== 2 ||
    mergeOrderAfter[0] !== mergeOrderBefore[1] ||
    mergeOrderAfter[1] !== mergeOrderBefore[0]
  ) {
    errors.push('合并列表顺序调整未生效')
  }

  await evaluate(
    cdp,
    "document.querySelector('[data-merge-index=\"0\"] [data-action=\"merge-view\"]')?.click()"
  )
  await waitFor(cdp, "document.querySelector('.main')?.dataset.view === 'viewer'", 10_000)
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 3", 15_000)
  const mergeViewName = await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) .doc-name')?.textContent")
  console.log('合并列表查看：', mergeViewName)
  if (!String(mergeViewName).includes('PDF示例.pdf')) {
    errors.push('合并列表查看按钮未打开文件')
  }
  await evaluate(cdp, "document.querySelector('[data-action=\"nav-merge\"]')?.click()")
  await waitFor(cdp, "document.querySelector('[data-action=\"merge-start\"]') !== null", 5_000)

  await evaluate(cdp, "document.querySelector('[data-action=\"merge-format-ofd\"]')?.click()")
  await evaluate(cdp, "document.querySelector('[data-action=\"merge-output\"]')?.click()")
  await waitFor(
    cdp,
    "document.querySelector('.merge-output-path')?.textContent?.includes('smoke-merge')",
    5_000
  )
  const mergeShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-merge.png`), Buffer.from(mergeShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-merge.png`)

  await evaluate(cdp, "document.querySelector('[data-action=\"merge-start\"]')?.click()")
  await waitFor(cdp, "document.querySelector('[data-merge-result=\"done\"]') !== null", 120_000)
  const mergeResult = await evaluate(
    cdp,
    "document.querySelector('[data-merge-result=\"done\"]')?.innerText.replace(/\\n/g, ' | ')"
  )
  console.log('合并结果：', JSON.stringify(mergeResult))
  if (!String(mergeResult).includes('7 页')) {
    errors.push('合并结果页数不是 7 页')
  }
  if (!existsSync(mergeOutput)) {
    errors.push('合并未生成输出文件')
  } else {
    console.log('合并输出体积：', statSync(mergeOutput).size)
  }

  await evaluate(cdp, "document.querySelector('.merge-result-actions .btn')?.click()")
  await waitFor(
    cdp,
    "document.querySelector('.main')?.dataset.view === 'viewer' && document.querySelector('.viewer-pane:not([hidden]) .page-total')?.textContent?.includes('7')",
    60_000
  )
  await waitFor(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) .page-slot[data-page=\"1\"] img.loaded') !== null",
    60_000
  )
  const mergedPages = await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) .page-total')?.textContent")
  console.log('合并文档打开页数：', mergedPages)
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 4", 15_000)
  const mergeOpenShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${shotPrefix}-merge-open.png`), Buffer.from(mergeOpenShot.data, 'base64'))
  console.log(`截图：.tools/${shotPrefix}-merge-open.png`)

  await evaluate(cdp, "document.querySelector('[data-action=\"nav-viewer\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.main')?.dataset.view === 'viewer'", 5_000)

  const tabsLeft = await evaluate(
    cdp,
    `(async () => {
      for (let index = 0; index < 12; index += 1) {
        const close = document.querySelector('[data-action="doc-tab-close"]')
        if (!close) break
        close.click()
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
      return document.querySelectorAll('.doc-tab').length
    })()`
  )
  console.log('关闭全部标签后剩余：', tabsLeft)
  if (tabsLeft !== 0) {
    errors.push('标签未全部关闭')
  }
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
  // before-quit 会等待 Java 引擎退出，留足时间避免残留实例占用单实例锁
  await sleep(6000)

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
