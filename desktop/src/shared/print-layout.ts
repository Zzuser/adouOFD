import type {
  PrintLayoutOptions,
  PrintMarginsMm,
  PrintOrientation,
  PrintPageOrder,
  PrintPaperSize
} from './types'

export const PAPER_SIZES_MM: Record<PrintPaperSize, { widthMm: number; heightMm: number }> = {
  A3: { widthMm: 297, heightMm: 420 },
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  A6: { widthMm: 105, heightMm: 148 },
  B5: { widthMm: 176, heightMm: 250 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  Legal: { widthMm: 215.9, heightMm: 355.6 },
  Tabloid: { widthMm: 279.4, heightMm: 431.8 }
}

export const PAPER_SIZE_OPTIONS: Array<{ value: PrintPaperSize; label: string }> = [
  { value: 'A3', label: 'A3（297 × 420 mm）' },
  { value: 'A4', label: 'A4（210 × 297 mm）' },
  { value: 'A5', label: 'A5（148 × 210 mm）' },
  { value: 'A6', label: 'A6（105 × 148 mm）' },
  { value: 'B5', label: 'B5（176 × 250 mm）' },
  { value: 'Letter', label: 'Letter（8.5 × 11 in）' },
  { value: 'Legal', label: 'Legal（8.5 × 14 in）' },
  { value: 'Tabloid', label: 'Tabloid（11 × 17 in）' }
]

export const PER_SHEET_OPTIONS = [2, 4, 6, 8, 9]

export const DEFAULT_MARGIN_MM = 10
export const MAX_MARGIN_MM = 50

export const DEFAULT_PRINT_LAYOUT: PrintLayoutOptions = {
  printerName: '',
  copies: 1,
  color: true,
  selection: 'all',
  currentPage: 1,
  rangeText: '',
  parity: 'all',
  reverse: false,
  paperSize: 'A4',
  orientation: 'portrait',
  marginMode: 'default',
  marginsMm: { top: DEFAULT_MARGIN_MM, right: DEFAULT_MARGIN_MM, bottom: DEFAULT_MARGIN_MM, left: DEFAULT_MARGIN_MM },
  duplex: 'simplex',
  pagesPerSheet: 1,
  pageOrder: 'row',
  printBorder: false
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function paperSizeMm(
  paper: PrintPaperSize,
  orientation: PrintOrientation
): { widthMm: number; heightMm: number } {
  const base = PAPER_SIZES_MM[paper] ?? PAPER_SIZES_MM.A4
  return orientation === 'landscape'
    ? { widthMm: base.heightMm, heightMm: base.widthMm }
    : { widthMm: base.widthMm, heightMm: base.heightMm }
}

export function resolveMarginsMm(layout: PrintLayoutOptions): PrintMarginsMm {
  if (layout.marginMode === 'none') {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }
  if (layout.marginMode === 'default') {
    return {
      top: DEFAULT_MARGIN_MM,
      right: DEFAULT_MARGIN_MM,
      bottom: DEFAULT_MARGIN_MM,
      left: DEFAULT_MARGIN_MM
    }
  }
  const clampMargin = (value: number): number =>
    clamp(Number.isFinite(value) ? value : DEFAULT_MARGIN_MM, 0, MAX_MARGIN_MM)
  return {
    top: clampMargin(layout.marginsMm.top),
    right: clampMargin(layout.marginsMm.right),
    bottom: clampMargin(layout.marginsMm.bottom),
    left: clampMargin(layout.marginsMm.left)
  }
}

export function parsePageRange(
  raw: string,
  pageCount: number
): { pages: number[]; error: string | null } {
  const text = raw.trim()
  if (!text) {
    return { pages: [], error: '请输入页码范围' }
  }
  if (pageCount < 1) {
    return { pages: [], error: '文档没有可打印的页面' }
  }
  const collected = new Set<number>()
  const tokens = text.split(/[,，]/).map((token) => token.trim()).filter(Boolean)
  if (tokens.length === 0) {
    return { pages: [], error: '请输入页码范围' }
  }
  for (const token of tokens) {
    const single = /^(\d+)$/.exec(token)
    if (single) {
      const page = Number.parseInt(single[1], 10)
      if (page < 1 || page > pageCount) {
        return { pages: [], error: `页码超出范围（1-${pageCount}）` }
      }
      collected.add(page)
      continue
    }
    const span = /^(\d*)\s*[-–—~]\s*(\d*)$/.exec(token)
    if (!span || (!span[1] && !span[2])) {
      return { pages: [], error: '页码范围格式应为 1-3,5' }
    }
    const start = span[1] ? Number.parseInt(span[1], 10) : 1
    const end = span[2] ? Number.parseInt(span[2], 10) : pageCount
    if (start < 1 || end < 1) {
      return { pages: [], error: '页码从 1 开始' }
    }
    if (start > pageCount) {
      return { pages: [], error: `页码超出范围（1-${pageCount}）` }
    }
    if (start > end) {
      return { pages: [], error: '页码范围应从小到大' }
    }
    for (let page = start; page <= Math.min(end, pageCount); page += 1) {
      collected.add(page)
    }
  }
  if (collected.size === 0) {
    return { pages: [], error: '没有可打印的页面' }
  }
  return { pages: Array.from(collected).sort((left, right) => left - right), error: null }
}

export function resolvePrintPages(pageCount: number, layout: PrintLayoutOptions): number[] {
  const total = Math.max(0, Math.floor(pageCount))
  if (total < 1) return []
  let pages: number[]
  if (layout.selection === 'custom') {
    pages = parsePageRange(layout.rangeText, total).pages
  } else if (layout.selection === 'current') {
    pages = [clamp(Math.round(layout.currentPage), 1, total)]
  } else {
    pages = Array.from({ length: total }, (_, index) => index + 1)
  }
  if (layout.parity !== 'all') {
    const wantOdd = layout.parity === 'odd'
    pages = pages.filter((page) => (page % 2 === 1) === wantOdd)
  }
  return layout.reverse ? [...pages].reverse() : pages
}

export function gridForPagesPerSheet(
  pagesPerSheet: number,
  orientation: PrintOrientation
): { cols: number; rows: number } {
  const landscape = orientation === 'landscape'
  switch (pagesPerSheet) {
    case 2:
      return landscape ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 }
    case 4:
      return { cols: 2, rows: 2 }
    case 6:
      return landscape ? { cols: 3, rows: 2 } : { cols: 2, rows: 3 }
    case 8:
      return landscape ? { cols: 4, rows: 2 } : { cols: 2, rows: 4 }
    case 9:
      return { cols: 3, rows: 3 }
    default:
      return { cols: 1, rows: 1 }
  }
}

export function buildPrintSheets(
  pages: number[],
  pagesPerSheet: number,
  pageOrder: PrintPageOrder,
  orientation: PrintOrientation
): number[][] {
  const { cols, rows } = gridForPagesPerSheet(pagesPerSheet, orientation)
  const capacity = cols * rows
  const sheets: number[][] = []
  for (let offset = 0; offset < pages.length; offset += capacity) {
    const chunk = pages.slice(offset, offset + capacity)
    const cells = new Array<number>(capacity).fill(0)
    chunk.forEach((page, index) => {
      const position = pageOrder === 'column' ? (index % rows) * cols + Math.floor(index / rows) : index
      cells[position] = page
    })
    sheets.push(cells)
  }
  return sheets
}
