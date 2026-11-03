import { BrowserWindow } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildPrintSheets,
  DEFAULT_PRINT_LAYOUT,
  gridForPagesPerSheet,
  MAX_MARGIN_MM,
  paperSizeMm,
  resolveMarginsMm,
  resolvePrintPages
} from '../shared/print-layout'
import { isPageRotation, type RotationMap } from '../shared/rotation'
import type {
  BackendInfo,
  PageMeta,
  PrintDocumentOptions,
  PrintDocumentResult,
  PrintDuplex,
  PrintLayoutOptions,
  PrintMarginMode,
  PrintOrientation,
  PrintPageOrder,
  PrintPageSelection,
  PrintPaperSize,
  PrintParity,
  PrinterInfo
} from '../shared/types'

const MAX_PRINT_PAGES = 2000
const PREPARE_TIMEOUT_MS = 5 * 60 * 1000
const MAX_COPIES = 99
const PER_SHEET_VALUES = [1, 2, 4, 6, 8, 9]

const PAPER_VALUES: PrintPaperSize[] = ['A3', 'A4', 'A5', 'A6', 'B5', 'Letter', 'Legal', 'Tabloid']
const ORIENTATION_VALUES: PrintOrientation[] = ['portrait', 'landscape']
const SELECTION_VALUES: PrintPageSelection[] = ['all', 'current', 'custom']
const PARITY_VALUES: PrintParity[] = ['all', 'odd', 'even']
const ORDER_VALUES: PrintPageOrder[] = ['row', 'column']
const DUPLEX_VALUES: PrintDuplex[] = ['simplex', 'longEdge', 'shortEdge']
const MARGIN_MODE_VALUES: PrintMarginMode[] = ['default', 'none', 'custom']

interface PrintDiagnostics {
  total: number
  loaded: number
  failedPages: number[]
}

const WAIT_FOR_IMAGES_SCRIPT = `
  (async () => {
    const images = Array.from(document.images);
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }));
    return {
      total: images.length,
      loaded: images.filter((image) => image.complete && image.naturalWidth > 0).length,
      failedPages: images
        .filter((image) => !image.naturalWidth)
        .map((image) => Number(image.dataset.page) || 0)
    };
  })()
`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function validMm(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 10 && value <= 1000
    ? value
    : 0
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function integerValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.round(numberValue(value, fallback))
  return Math.min(max, Math.max(min, parsed))
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function normalizeLayout(raw: unknown): PrintLayoutOptions {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const marginsRaw =
    typeof value.marginsMm === 'object' && value.marginsMm !== null
      ? (value.marginsMm as Record<string, unknown>)
      : {}
  const margin = (side: string, fallback: number): number =>
    Math.min(MAX_MARGIN_MM, Math.max(0, numberValue(marginsRaw[side], fallback)))
  const pagesPerSheet = integerValue(value.pagesPerSheet, 1, 1, 9)
  const printerName = typeof value.printerName === 'string' ? value.printerName.trim().slice(0, 200) : ''
  const rangeText = typeof value.rangeText === 'string' ? value.rangeText.slice(0, 120) : ''
  return {
    printerName,
    copies: integerValue(value.copies, 1, 1, MAX_COPIES),
    color: booleanValue(value.color, true),
    selection: enumValue(value.selection, SELECTION_VALUES, 'all'),
    currentPage: integerValue(value.currentPage, 1, 1, 100000),
    rangeText,
    parity: enumValue(value.parity, PARITY_VALUES, 'all'),
    reverse: booleanValue(value.reverse, false),
    paperSize: enumValue(value.paperSize, PAPER_VALUES, 'A4'),
    orientation: enumValue(value.orientation, ORIENTATION_VALUES, 'portrait'),
    marginMode: enumValue(value.marginMode, MARGIN_MODE_VALUES, 'default'),
    marginsMm: {
      top: margin('top', DEFAULT_PRINT_LAYOUT.marginsMm.top),
      right: margin('right', DEFAULT_PRINT_LAYOUT.marginsMm.right),
      bottom: margin('bottom', DEFAULT_PRINT_LAYOUT.marginsMm.bottom),
      left: margin('left', DEFAULT_PRINT_LAYOUT.marginsMm.left)
    },
    duplex: enumValue(value.duplex, DUPLEX_VALUES, 'simplex'),
    pagesPerSheet: PER_SHEET_VALUES.includes(pagesPerSheet) ? pagesPerSheet : 1,
    pageOrder: enumValue(value.pageOrder, ORDER_VALUES, 'row'),
    printBorder: booleanValue(value.printBorder, false)
  }
}

function printDpi(pageCount: number): number {
  if (pageCount <= 5) return 300
  if (pageCount <= 20) return 200
  return 150
}

function normalizeRotations(raw: unknown): RotationMap {
  if (typeof raw !== 'object' || raw === null) return {}
  const rotations: RotationMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const page = Number.parseInt(key, 10)
    const rotation = Number(value)
    if (Number.isInteger(page) && page > 0 && isPageRotation(rotation) && rotation !== 0) {
      rotations[page] = rotation
    }
  }
  return rotations
}

export function parsePrintOptions(raw: unknown): PrintDocumentOptions | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const id = typeof value.id === 'string' ? value.id.trim() : ''
  if (!/^[A-Za-z0-9-]{1,200}$/.test(id)) return null
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!Array.isArray(value.pages) || value.pages.length === 0) return null
  if (value.pages.length > MAX_PRINT_PAGES) return null
  const pages: PageMeta[] = []
  for (let index = 0; index < value.pages.length; index += 1) {
    const item = value.pages[index]
    if (typeof item !== 'object' || item === null) return null
    const meta = item as Record<string, unknown>
    const pageIndex = Number.isInteger(meta.index) ? Number(meta.index) : index + 1
    pages.push({
      index: pageIndex > 0 ? pageIndex : index + 1,
      widthMm: validMm(meta.widthMm),
      heightMm: validMm(meta.heightMm)
    })
  }
  return {
    id,
    name: name.slice(0, 260) || '打印文档',
    pages,
    rotations: normalizeRotations(value.rotations),
    layout: normalizeLayout(value.layout)
  }
}

function buildPrintHtml(
  info: BackendInfo,
  options: PrintDocumentOptions,
  selectedPages: number[],
  sheets: number[][],
  layout: PrintLayoutOptions
): { html: string; dpi: number } {
  const dpi = printDpi(selectedPages.length)
  const paper = paperSizeMm(layout.paperSize, layout.orientation)
  const margins = resolveMarginsMm(layout)
  const { cols, rows } = gridForPagesPerSheet(layout.pagesPerSheet, layout.orientation)
  const token = info.token ? encodeURIComponent(info.token) : ''
  const base = `http://127.0.0.1:${info.port}/api/documents/${encodeURIComponent(options.id)}`
  const cells = sheets
    .map((sheet) => {
      const inner = sheet
        .map((page) => {
          if (page < 1) return '<div class="cell empty"></div>'
          const rotation = options.rotations[page] ?? 0
          const rotate = rotation ? `&rotate=${rotation}` : ''
          const url = `${base}/pages/${page}?dpi=${dpi}${rotate}&token=${token}`
          return `<div class="cell${layout.printBorder ? ' bordered' : ''}"><img data-page="${page}"${rotation ? ` data-rotation="${rotation}"` : ''} src="${escapeHtml(url)}" alt=""></div>`
        })
        .join('')
      return `<div class="sheet"><div class="grid${layout.color ? '' : ' grayscale'}">${inner}</div></div>`
    })
    .join('')
  const width = Math.round(paper.widthMm * 10) / 10
  const height = Math.round(paper.heightMm * 10) / 10
  const gap = layout.pagesPerSheet > 1 ? '2mm' : '0'
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http://127.0.0.1:*; style-src 'unsafe-inline'">
<title>${escapeHtml(options.name)}</title>
<style>
  @page { size: ${width}mm ${height}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet {
    box-sizing: border-box;
    width: ${width}mm;
    height: ${height}mm;
    padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
    break-after: page;
    page-break-after: always;
  }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .grid {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-columns: repeat(${cols}, 1fr);
    grid-template-rows: repeat(${rows}, 1fr);
    gap: ${gap};
  }
  .cell {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .cell.bordered { border: 0.2mm solid #9a9a9a; }
  .cell img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .grid.grayscale img { filter: grayscale(1); }
</style>
</head>
<body>${cells}</body>
</html>`
  return { html, dpi }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function listPrinters(
  contents: Electron.WebContents | null | undefined
): Promise<PrinterInfo[]> {
  if (!contents || contents.isDestroyed()) return []
  try {
    const printers = await contents.getPrintersAsync()
    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName || printer.name
    }))
  } catch {
    return []
  }
}

export async function printDocument(
  info: BackendInfo,
  options: PrintDocumentOptions
): Promise<PrintDocumentResult> {
  if (!info.port || !info.token) {
    return { ok: false, error: '本地引擎尚未就绪，请稍候再试' }
  }
  const layout = options.layout
  const selectedPages = resolvePrintPages(options.pages.length, layout)
  if (selectedPages.length === 0) {
    return { ok: false, error: '没有可打印的页面' }
  }
  const sheets = buildPrintSheets(
    selectedPages,
    layout.pagesPerSheet,
    layout.pageOrder,
    layout.orientation
  )
  const { html, dpi } = buildPrintHtml(info, options, selectedPages, sheets, layout)
  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: false
    }
  })
  printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  let workDir: string | null = null
  try {
    workDir = await mkdtemp(join(tmpdir(), 'adou-print-'))
    const htmlPath = join(workDir, 'print.html')
    await writeFile(htmlPath, html, 'utf8')
    await printWindow.loadFile(htmlPath)

    const diagnostics = await withTimeout(
      printWindow.webContents.executeJavaScript(WAIT_FOR_IMAGES_SCRIPT, true) as Promise<PrintDiagnostics>,
      PREPARE_TIMEOUT_MS,
      '准备打印超时，请稍后重试'
    )
    if (!diagnostics || diagnostics.total !== selectedPages.length) {
      return {
        ok: false,
        error: '打印页面准备失败',
        pages: selectedPages.length,
        sheets: sheets.length,
        dpi
      }
    }
    if (diagnostics.loaded !== diagnostics.total) {
      const failed = diagnostics.failedPages.filter((page) => page > 0)
      return {
        ok: false,
        error: failed.length > 0
          ? `第 ${failed.join('、')} 页渲染失败，暂时无法打印`
          : '打印页面加载失败，请稍后重试',
        pages: selectedPages.length,
        sheets: sheets.length,
        dpi
      }
    }

    const testPdfPath = process.env.ADOU_TEST_PRINT_PDF
    if (testPdfPath) {
      const data = await printWindow.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        landscape: false,
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      })
      await writeFile(testPdfPath, data)
      return {
        ok: true,
        pages: selectedPages.length,
        sheets: sheets.length,
        dpi,
        testPdf: testPdfPath
      }
    }

    const media = paperSizeMm(layout.paperSize, 'portrait')
    const printOptions: Electron.WebContentsPrintOptions = {
      silent: true,
      printBackground: true,
      color: layout.color,
      copies: layout.copies,
      duplexMode: layout.duplex,
      margins: { marginType: 'none' },
      landscape: layout.orientation === 'landscape',
      pageSize: {
        width: Math.round(media.widthMm * 1000),
        height: Math.round(media.heightMm * 1000)
      },
      scaleFactor: 100
    }
    if (layout.printerName) {
      printOptions.deviceName = layout.printerName
    }
    const outcome = await new Promise<{ success: boolean; reason: string }>((resolve) => {
      printWindow.webContents.print(printOptions, (success, failureReason) => {
        resolve({ success, reason: failureReason })
      })
    })
    if (outcome.success) {
      return { ok: true, pages: selectedPages.length, sheets: sheets.length, dpi }
    }
    return {
      ok: false,
      error: outcome.reason ? `打印失败：${outcome.reason}` : '打印失败，请检查打印机状态',
      pages: selectedPages.length,
      sheets: sheets.length,
      dpi
    }
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error),
      pages: selectedPages.length,
      sheets: sheets.length,
      dpi
    }
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
