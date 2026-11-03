#!/usr/bin/env node
/**
 * 文本 / Markdown UI 冒烟：启动生产构建的 Electron，打开真实 .md/.txt 文件，
 * 验证预览、本地图片、编码识别、编辑保存、关闭确认与最近文件。
 *
 * 前置：cd desktop && npm run build
 * 运行：node scripts/smoke-text.mjs
 */
import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(root, 'desktop')
const outDir = join(root, '.tools')
const electronExe = process.env.ADOU_SMOKE_EXE?.trim()
  ? process.env.ADOU_SMOKE_EXE.trim()
  : join(desktop, 'node_modules', 'electron', 'dist', 'electron.exe')
const packagedLaunch = Boolean(process.env.ADOU_SMOKE_EXE?.trim())
const requireDesktop = createRequire(join(desktop, 'package.json'))
const iconv = requireDesktop('iconv-lite')

const fixtureDir = join(outDir, 'text-smoke')
const guidePath = join(fixtureDir, 'guide.md')
const notesPath = join(fixtureDir, 'notes.txt')
const newFilePath = join(fixtureDir, 'new-home.md')
const imagePath = join(fixtureDir, 'images', 'cat.png')
const exportPath = join(outDir, 'text-smoke-export.pdf')

rmSync(fixtureDir, { recursive: true, force: true })
mkdirSync(join(fixtureDir, 'images'), { recursive: true })
copyFileSync(join(desktop, 'build', 'fileicons', 'md-file.png'), imagePath)
rmSync(newFilePath, { force: true })
rmSync(exportPath, { force: true })

const guideSource = [
  '# 阿豆 Markdown 测试',
  '',
  '这是 **Markdown** 预览测试，包含中文与 `inline code`。',
  '',
  '## 功能清单',
  '',
  '| 功能 | 状态 |',
  '| --- | --- |',
  '| 表格 | 通过 |',
  '| 任务列表 | 通过 |',
  '',
  '- [x] 本地图片',
  '- [ ] 外部上传（不启用）',
  '',
  '```ts',
  "const message: string = 'hello'",
  'console.log(message)',
  '```',
  '',
  '![猫](images/cat.png)',
  '',
  '[打开笔记](notes.txt)',
  '',
  ...Array.from(
    { length: 24 },
    (_, index) => `滚动测试段落 ${index + 1}：用于验证编辑区与预览区的同步滚动。`
  ),
  ''
].join('\r\n')
writeFileSync(guidePath, guideSource, 'utf8')

const notesSource = '第一行：阿豆文本编辑\n第二行：GB18030 编码保持\n第三行：换行符保持 LF\n'
writeFileSync(notesPath, iconv.encode(notesSource, 'gb18030'))
const notesOriginal = readFileSync(notesPath)

const smokeAppData = join(outDir, 'text-smoke-appdata')
rmSync(smokeAppData, { recursive: true, force: true })
mkdirSync(join(smokeAppData, 'adou-ofd'), { recursive: true })
// 打包版会尝试写 HKCU 关联；冒烟使用 optedOut 配置，避免改动当前用户注册表
writeFileSync(
  join(smokeAppData, 'adou-ofd', 'windows-integration.json'),
  '{"optedOut":true}\n',
  'utf8'
)

const debugPort = await findFreePort()
const errors = []
let child = null

const childEnv = {
  ...process.env,
  APPDATA: smokeAppData,
  ADOU_USER_DATA: join(smokeAppData, 'adou-ofd'),
  ADOU_TEST_OPEN_FILE: guidePath,
  ADOU_TEST_NEW_TEXT: newFilePath,
  ADOU_TEST_EXPORT_PDF: exportPath,
  ELECTRON_ENABLE_LOGGING: '0'
}
delete childEnv.ELECTRON_RUN_AS_NODE
const launchArgs = packagedLaunch
  ? [`--remote-debugging-port=${debugPort}`]
  : ['.', `--remote-debugging-port=${debugPort}`]
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

const timeout = setTimeout(() => {
  console.error('文本冒烟超时')
  child?.kill()
  process.exit(1)
}, 180_000)

try {
  const target = await waitForTarget()
  const cdp = await connect(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Log.enable')
  cdp.on('Runtime.exceptionThrown', (params) => {
    errors.push(`exception: ${params.exceptionDetails.text}`)
  })
  cdp.on('Log.entryAdded', (params) => {
    if (params.entry.level === 'error') {
      errors.push(`console: ${params.entry.text ?? ''}`)
    }
  })

  await waitFor(cdp, "document.querySelector('.empty') !== null", 30_000)
  await waitFor(cdp, "document.querySelector('.engine-mini.ready') !== null", 40_000)
  const home = await evaluate(
    cdp,
    `(() => ({
      heading: document.querySelector('.empty h2')?.textContent,
      hasNewMarkdown: Boolean(document.querySelector('[data-action="new-markdown"]')),
      hasNewText: Boolean(document.querySelector('[data-action="new-text"]')),
      hint: document.querySelector('.empty-hint')?.textContent
    }))()`
  )
  console.log('首页入口：', JSON.stringify(home))
  if (home.heading !== '打开或新建文档') errors.push('首页标题未适配新建入口')
  if (!home.hasNewMarkdown || !home.hasNewText) errors.push('首页缺少新建 Markdown/文本入口')
  if (!String(home.hint).includes('阅读、编辑')) errors.push('首页提示未说明编辑能力')
  const homeShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, 'text-smoke-home.png'), Buffer.from(homeShot.data, 'base64'))

  await evaluate(cdp, "document.querySelector('[data-action=\"new-markdown\"]')?.click()")
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 1", 15_000)
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-doc-bar .doc-name')?.textContent?.includes('new-home.md')", 15_000)
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .cm-placeholder')?.textContent?.includes('开始输入 Markdown')", 10_000)
  console.log('首页新建 Markdown：true')
  await focusEditor(cdp)
  await pressCtrlEnd(cdp)
  await cdp.send('Input.insertText', { text: '# 首页新建\n\n从首页创建并保存。' })
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-dirty-dot') !== null", 5_000)
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-save\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-dirty-dot') === null", 15_000)
  if (!readFileSync(newFilePath, 'utf8').includes('从首页创建并保存。')) {
    errors.push('首页新建的 Markdown 保存失败')
  }
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-close\"]')?.click()")
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 0", 10_000)
  await waitFor(cdp, "document.querySelector('.empty') !== null", 10_000)

  await evaluate(cdp, "document.querySelector('[data-action=\"open\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.text-viewer') !== null", 30_000)
  await waitFor(cdp, "document.querySelector('.md-body h1') !== null", 15_000)
  await sleep(600)

  const initial = await evaluate(
    cdp,
    `(() => ({
      name: document.querySelector('.doc-name')?.textContent?.trim(),
      badge: document.querySelector('.text-doc-bar .format-badge')?.textContent?.trim(),
      modeSplit: document.querySelector('[data-action="text-mode-split"]')?.classList.contains('active'),
      heading: document.querySelector('.md-body h1')?.textContent,
      paragraphs: document.querySelectorAll('.md-body p').length,
      tableRows: document.querySelectorAll('.md-body table tbody tr').length,
      codeHighlighted: Boolean(document.querySelector('.md-body pre code.hljs')),
      checkboxes: document.querySelectorAll('.md-body input[type="checkbox"]').length,
      firstChecked: document.querySelector('.md-body input[type="checkbox"]')?.checked,
      imageLoaded: (() => { const img = document.querySelector('.md-body img'); return Boolean(img && img.complete && img.naturalWidth > 0) })(),
      imageSrc: document.querySelector('.md-body img')?.getAttribute('src'),
      status: document.querySelector('.text-status-bar')?.innerText.replace(/\\n/g, ' | ')
    }))()`
  )
  console.log('Markdown 初始状态：', JSON.stringify(initial))
  if (!String(initial.name).includes('guide.md')) errors.push('未打开 guide.md')
  if (initial.badge !== 'MD') errors.push('Markdown 标签徽标异常')
  if (!initial.modeSplit) errors.push('Markdown 默认不是分栏模式')
  if (initial.heading !== '阿豆 Markdown 测试') errors.push('Markdown 标题未渲染')
  if (initial.tableRows !== 2) errors.push(`GFM 表格行数异常：${initial.tableRows}`)
  if (!initial.codeHighlighted) errors.push('代码块未高亮')
  if (initial.checkboxes !== 2 || initial.firstChecked !== true) errors.push('任务列表未渲染')
  if (!initial.imageLoaded) errors.push('本地图片未加载')
  if (!String(initial.imageSrc).startsWith('adou-file://')) errors.push('本地图片未使用 adou-file 协议')
  if (!String(initial.status).includes('UTF-8') || !String(initial.status).includes('CRLF')) {
    errors.push(`Markdown 编码/换行状态异常：${initial.status}`)
  }
  const mdShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, 'text-smoke-md.png'), Buffer.from(mdShot.data, 'base64'))
  console.log('截图：.tools/text-smoke-md.png')

  // 导出 PDF
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-export-pdf\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-banner.info') !== null", 30_000)
  const exportBytes = await waitForPdfFile(exportPath, 30_000)
  const exported = await evaluate(
    cdp,
    `(async () => {
      const info = await window.adou.getBackendInfo()
      const headers = { 'X-ADou-Token': info.token, 'Content-Type': 'application/json' }
      const response = await fetch('http://127.0.0.1:' + info.port + '/api/documents/open', {
        method: 'POST',
        headers,
        body: JSON.stringify({ path: ${JSON.stringify(exportPath)} })
      })
      const summary = await response.json()
      if (summary.id) {
        await fetch('http://127.0.0.1:' + info.port + '/api/documents/' + summary.id, {
          method: 'DELETE',
          headers: { 'X-ADou-Token': info.token }
        })
      }
      return { kind: summary.kind, pages: summary.pageCount, error: summary.message ?? null }
    })()`
  )
  console.log('导出 PDF：', exportBytes, '字节', JSON.stringify(exported))
  if (exportBytes < 20_000) errors.push(`导出 PDF 体积过小：${exportBytes}`)
  if (exported.kind !== 'PDF' || !(exported.pages >= 1)) errors.push('导出的 PDF 无法打开')
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-banner.info .text-banner-close')?.click()")

  // 在应用内打开导出的 PDF，检查分页与排版
  const exportInstance = spawn(electronExe, packagedLaunch ? [exportPath] : ['.', exportPath], {
    cwd: desktop,
    env: childEnv,
    stdio: 'ignore'
  })
  await new Promise((resolve) => exportInstance.once('exit', resolve))
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 2", 30_000)
  await waitFor(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) .doc-name')?.textContent?.includes('text-smoke-export.pdf')",
    30_000
  )
  await waitFor(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) .page-slot[data-page=\"1\"] img.loaded') !== null",
    60_000
  )
  await sleep(400)
  const exportShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, 'text-smoke-export.png'), Buffer.from(exportShot.data, 'base64'))
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"close\"]')?.click()")
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 1", 15_000)
  await waitFor(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) .text-doc-bar .doc-name')?.textContent?.includes('guide.md')",
    15_000
  )

  // 拖动分栏
  const splitBefore = await evaluate(
    cdp,
    `(() => {
      const editor = document.querySelector('.viewer-pane:not([hidden]) .text-editor-pane')?.getBoundingClientRect()
      const preview = document.querySelector('.viewer-pane:not([hidden]) .text-preview-pane')?.getBoundingClientRect()
      const splitter = document.querySelector('.viewer-pane:not([hidden]) .text-splitter')?.getBoundingClientRect()
      return {
        editor: editor?.width,
        preview: preview?.width,
        splitterX: splitter ? splitter.left + splitter.width / 2 : 0,
        splitterY: splitter ? splitter.top + splitter.height / 2 : 0,
        value: document.querySelector('.viewer-pane:not([hidden]) .text-splitter')?.getAttribute('aria-valuenow')
      }
    })()`
  )
  await dragMouse(cdp, splitBefore.splitterX, splitBefore.splitterY, splitBefore.splitterX - 150, splitBefore.splitterY)
  const splitAfter = await evaluate(
    cdp,
    `(() => {
      const editor = document.querySelector('.viewer-pane:not([hidden]) .text-editor-pane')?.getBoundingClientRect()
      const preview = document.querySelector('.viewer-pane:not([hidden]) .text-preview-pane')?.getBoundingClientRect()
      return {
        editor: editor?.width,
        preview: preview?.width,
        value: document.querySelector('.viewer-pane:not([hidden]) .text-splitter')?.getAttribute('aria-valuenow')
      }
    })()`
  )
  console.log('分栏拖动：', JSON.stringify({ before: splitBefore, after: splitAfter }))
  if (!(splitAfter.editor < splitBefore.editor - 50)) errors.push('拖动分栏后编辑区未变窄')
  if (!(splitAfter.preview > splitBefore.preview + 50)) errors.push('拖动分栏后预览区未变宽')
  const splitShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, 'text-smoke-split.png'), Buffer.from(splitShot.data, 'base64'))
  await evaluate(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) .text-splitter')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))"
  )
  await sleep(350)
  const splitReset = await evaluate(
    cdp,
    `(() => {
      const editor = document.querySelector('.viewer-pane:not([hidden]) .text-editor-pane')?.getBoundingClientRect()
      const preview = document.querySelector('.viewer-pane:not([hidden]) .text-preview-pane')?.getBoundingClientRect()
      return { editor: editor?.width, preview: preview?.width }
    })()`
  )
  console.log('双击复位分栏：', JSON.stringify(splitReset))
  if (Math.abs(splitReset.editor - splitReset.preview) > 24) errors.push('双击未恢复 1:1 分栏')

  // 目录导航
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-outline\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-outline-popover') !== null", 5_000)
  const outlineItems = await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.viewer-pane:not([hidden]) .text-outline-item')).map((item) => ({ text: item.textContent, line: item.dataset.outlineLine }))"
  )
  console.log('目录：', JSON.stringify(outlineItems))
  if (outlineItems.length !== 2) errors.push(`目录标题数量异常：${outlineItems.length}`)
  await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.viewer-pane:not([hidden]) .text-outline-item')).find((item) => item.textContent === '功能清单')?.click()"
  )
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-outline-popover') === null", 5_000)
  await waitFor(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) .text-preview-pane')?.scrollTop > 40",
    5_000
  )
  console.log('目录跳转：true')

  // 同步滚动
  await sleep(800)
  const syncBefore = await evaluate(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-scroll-sync\"]')?.getAttribute('aria-pressed')"
  )
  if (syncBefore !== 'true') errors.push('同步滚动默认未开启')
  await evaluate(
    cdp,
    `(() => {
      const preview = document.querySelector('.viewer-pane:not([hidden]) .text-preview-pane')
      if (!preview) return false
      preview.scrollTop = (preview.scrollHeight - preview.clientHeight) / 2
      preview.dispatchEvent(new Event('scroll'))
      return true
    })()`
  )
  await waitFor(
    cdp,
    "(document.querySelector('.viewer-pane:not([hidden]) .cm-scroller')?.scrollTop ?? 0) > 20",
    5_000
  )
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-scroll-sync\"]')?.click()")
  await waitFor(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-scroll-sync\"]')?.getAttribute('aria-pressed') === 'false'",
    5_000
  )
  await sleep(300)
  await evaluate(
    cdp,
    `(() => {
      const editor = document.querySelector('.viewer-pane:not([hidden]) .cm-scroller')
      const preview = document.querySelector('.viewer-pane:not([hidden]) .text-preview-pane')
      if (editor) editor.scrollTop = 0
      if (preview) preview.scrollTop = 0
      return true
    })()`
  )
  await sleep(400)
  await evaluate(
    cdp,
    `(() => {
      const preview = document.querySelector('.viewer-pane:not([hidden]) .text-preview-pane')
      if (preview) preview.scrollTop = preview.scrollHeight
      return true
    })()`
  )
  await sleep(500)
  const syncOffEditor = await evaluate(
    cdp,
    "document.querySelector('.viewer-pane:not([hidden]) .cm-scroller')?.scrollTop ?? 0"
  )
  console.log('同步滚动关闭后编辑区位置：', syncOffEditor)
  if (syncOffEditor > 8) errors.push('关闭同步滚动后编辑区仍被联动')
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-scroll-sync\"]')?.click()")
  await sleep(200)
  await evaluate(
    cdp,
    `(() => {
      const preview = document.querySelector('.viewer-pane:not([hidden]) .text-preview-pane')
      if (preview) preview.scrollTop = 0
      return true
    })()`
  )
  await sleep(300)

  // 预览模式
  await evaluate(cdp, "document.querySelector('[data-action=\"text-mode-preview\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.text-body.mode-preview') !== null", 5_000)
  await evaluate(cdp, "document.querySelector('[data-action=\"text-mode-split\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.text-body.mode-split') !== null", 5_000)

  // 相对链接打开 GB18030 文本
  await evaluate(cdp, "document.querySelector('.md-body a[href=\"notes.txt\"]')?.click()")
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 2", 15_000)
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-doc-bar .doc-name')?.textContent?.includes('notes.txt')", 15_000)
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .cm-content')?.textContent?.includes('第一行')", 15_000)
  const notesState = await evaluate(
    cdp,
    `(() => ({
      badge: document.querySelector('.viewer-pane:not([hidden]) .text-doc-bar .format-badge')?.textContent?.trim(),
      hasPreview: Boolean(document.querySelector('.viewer-pane:not([hidden]) [data-markdown-preview]')),
      status: document.querySelector('.viewer-pane:not([hidden]) .text-status-bar')?.innerText.replace(/\\n/g, ' | '),
      text: document.querySelector('.viewer-pane:not([hidden]) .cm-content')?.innerText
    }))()`
  )
  console.log('GB18030 文本：', JSON.stringify(notesState))
  if (notesState.badge !== 'TXT') errors.push('文本标签徽标异常')
  if (notesState.hasPreview) errors.push('纯文本不应显示 Markdown 预览')
  if (!String(notesState.status).includes('GB18030')) errors.push('GB18030 未识别')
  if (!String(notesState.status).includes('LF') || String(notesState.status).includes('CRLF')) {
    errors.push('文本 LF 状态异常')
  }
  if (!String(notesState.text).includes('第二行')) errors.push('GB18030 内容解码异常')

  // 编辑并保存 GB18030 文本
  await focusEditor(cdp)
  await pressCtrlEnd(cdp)
  await cdp.send('Input.insertText', { text: '\n追加的 GB18030 内容。' })
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-dirty-dot') !== null", 5_000)
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-save\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-dirty-dot') === null", 15_000)
  const notesSaved = iconv.decode(readFileSync(notesPath), 'gb18030')
  console.log('GB18030 保存后：', JSON.stringify(notesSaved.split('\n').slice(-2)))
  if (!notesSaved.includes('追加的 GB18030 内容。')) errors.push('GB18030 文本保存失败')
  if (notesSaved.includes('\r')) errors.push('GB18030 文本换行符被改变')

  // 未保存关闭：不写入磁盘
  const notesBeforeDiscard = readFileSync(notesPath)
  await focusEditor(cdp)
  await pressCtrlEnd(cdp)
  await cdp.send('Input.insertText', { text: '\n这段不应写入磁盘。' })
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-dirty-dot') !== null", 5_000)
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-close\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.text-close-dialog') !== null", 5_000)
  const dialogText = await evaluate(cdp, "document.querySelector('.text-close-dialog')?.innerText")
  console.log('关闭确认：', JSON.stringify(String(dialogText).replace(/\n/g, ' | ')))
  if (!String(dialogText).includes('notes.txt')) errors.push('关闭确认未显示文件名')
  await evaluate(cdp, "document.querySelector('[data-action=\"text-close-discard\"]')?.click()")
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 1", 10_000)
  if (!readFileSync(notesPath).equals(notesBeforeDiscard)) errors.push('不保存关闭仍写入了磁盘')

  // 回到 Markdown，编辑后保存
  await evaluate(cdp, "document.querySelectorAll('.doc-tab')[0]?.querySelector('[data-action=\"doc-tab\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-doc-bar .doc-name')?.textContent?.includes('guide.md')", 10_000)
  await focusEditor(cdp)
  await pressCtrlEnd(cdp)
  await cdp.send('Input.insertText', { text: '\n\n## 追加章节\n\n保存测试段落。' })
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-dirty-dot') !== null", 5_000)
  await waitFor(cdp, "document.querySelector('.md-body h2:last-of-type')?.textContent === '追加章节'", 5_000)
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-save\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-dirty-dot') === null", 15_000)
  const guideSaved = readFileSync(guidePath, 'utf8')
  console.log('Markdown 保存后末尾：', JSON.stringify(guideSaved.slice(-60)))
  if (!guideSaved.includes('保存测试段落。')) errors.push('Markdown 保存失败')
  if (!guideSaved.includes('\r\n')) errors.push('Markdown CRLF 未保持')
  if (guideSaved.replace(/\r\n/g, '').includes('\n')) errors.push('Markdown 出现混合换行')
  if (!guideSaved.includes('阿豆 Markdown 测试')) errors.push('Markdown 保存后原内容丢失')

  // 保存并关闭
  await focusEditor(cdp)
  await pressCtrlEnd(cdp)
  await cdp.send('Input.insertText', { text: '\n\n关闭时保存。' })
  await waitFor(cdp, "document.querySelector('.viewer-pane:not([hidden]) .text-dirty-dot') !== null", 5_000)
  await evaluate(cdp, "document.querySelector('.viewer-pane:not([hidden]) [data-action=\"text-close\"]')?.click()")
  await waitFor(cdp, "document.querySelector('.text-close-dialog') !== null", 5_000)
  await evaluate(cdp, "document.querySelector('[data-action=\"text-close-save\"]')?.click()")
  await waitFor(cdp, "document.querySelectorAll('.doc-tab').length === 0", 20_000)
  await waitFor(cdp, "document.querySelector('.empty') !== null", 10_000)
  if (!readFileSync(guidePath, 'utf8').includes('关闭时保存。')) errors.push('保存并关闭未写入文件')

  const recent = await evaluate(
    cdp,
    "Array.from(document.querySelectorAll('.recent-item')).map((item) => ({ badge: item.querySelector('.format-badge')?.textContent, name: item.querySelector('.recent-name')?.textContent }))"
  )
  console.log('最近文件：', JSON.stringify(recent))
  if (!recent.some((item) => item.badge === 'MD')) errors.push('最近文件缺少 Markdown 记录')
  if (!recent.some((item) => item.badge === 'TXT')) errors.push('最近文件缺少文本记录')
  const recentShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, 'text-smoke-recent.png'), Buffer.from(recentShot.data, 'base64'))

  await evaluate(cdp, 'setTimeout(() => window.close(), 50); true')
  await sleep(4000)

  if (errors.length > 0) {
    console.error('文本冒烟失败：')
    for (const error of errors) console.error('-', error)
    process.exitCode = 1
  } else {
    console.log('文本 / Markdown UI 冒烟通过')
  }
} catch (error) {
  console.error('文本冒烟异常：', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  clearTimeout(timeout)
  await sleep(500)
  if (child && child.exitCode === null) child.kill()
}

async function focusEditor(cdp) {
  const rect = await evaluate(
    cdp,
    `(() => {
      const pane = document.querySelector('.viewer-pane:not([hidden]) .text-editor-pane')
      if (!pane) return null
      const box = pane.getBoundingClientRect()
      return {
        x: box.left + Math.min(160, box.width * 0.4),
        y: box.top + box.height / 2
      }
    })()`
  )
  if (!rect) throw new Error('找不到编辑器')
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: rect.x,
    y: rect.y,
    button: 'left',
    clickCount: 1
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: rect.x,
    y: rect.y,
    button: 'left',
    clickCount: 1
  })
  await sleep(250)
}

async function pressCtrlEnd(cdp) {
  const event = {
    key: 'End',
    code: 'End',
    windowsVirtualKeyCode: 35,
    nativeVirtualKeyCode: 35,
    modifiers: 2
  }
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...event })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
  await sleep(200)
}

async function dragMouse(cdp, x1, y1, x2, y2) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: x1,
    y: y1,
    button: 'left',
    clickCount: 1
  })
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x1 + ((x2 - x1) * step) / 8,
      y: y1 + ((y2 - y1) * step) / 8,
      button: 'left',
      buttons: 1
    })
    await sleep(20)
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: x2,
    y: y2,
    button: 'left',
    clickCount: 1
  })
  await sleep(250)
}

async function waitForPdfFile(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastSize = 0
  while (Date.now() < deadline) {
    try {
      if (existsSync(path)) {
        const size = readFileSync(path).length
        if (size > 0 && size === lastSize && readFileSync(path).subarray(0, 5).toString('latin1') === '%PDF-') {
          return size
        }
        lastSize = size
      }
    } catch {
      // 文件仍在写入
    }
    await sleep(300)
  }
  throw new Error(`等待导出 PDF 超时：${path}`)
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
      // 等待调试端口
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}
