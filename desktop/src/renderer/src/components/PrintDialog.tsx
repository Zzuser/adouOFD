import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackendInfo, DocumentSummary, PrinterInfo, PrintLayoutOptions } from '@shared/types'
import { rotationOf, type RotationMap } from '@shared/rotation'
import {
  buildPrintSheets,
  DEFAULT_PRINT_LAYOUT,
  gridForPagesPerSheet,
  MAX_MARGIN_MM,
  PAPER_SIZE_OPTIONS,
  parsePageRange,
  paperSizeMm,
  PER_SHEET_OPTIONS,
  resolveMarginsMm,
  resolvePrintPages
} from '@shared/print-layout'
import { messageOf, pageImageUrl } from '../api'
import { IconAlert, IconChevronLeft, IconChevronRight, IconClose, IconPrint } from './icons'

const MARGIN_LABELS: Record<keyof PrintLayoutOptions['marginsMm'], string> = {
  top: '上',
  right: '右',
  bottom: '下',
  left: '左'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function initialLayout(page: number, pageCount: number): PrintLayoutOptions {
  return {
    ...DEFAULT_PRINT_LAYOUT,
    currentPage: clamp(Math.round(page), 1, Math.max(1, pageCount)),
    marginsMm: { ...DEFAULT_PRINT_LAYOUT.marginsMm }
  }
}

interface PrintDialogProps {
  open: boolean
  backend: BackendInfo
  doc: DocumentSummary
  currentPage: number
  rotations: RotationMap
  onClose: () => void
}

export function PrintDialog({
  open,
  backend,
  doc,
  currentPage,
  rotations,
  onClose
}: PrintDialogProps) {
  const [layout, setLayout] = useState<PrintLayoutOptions>(() => initialLayout(currentPage, doc.pageCount))
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printerState, setPrinterState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [previewSheet, setPreviewSheet] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!open) return
    setLayout(initialLayout(currentPage, doc.pageCount))
    setPreviewSheet(0)
    setBusy(false)
    setError(null)
    setPrinterState('loading')
    setPrinters([])
    let alive = true
    void window.adou
      .listPrinters()
      .then((list) => {
        if (!alive) return
        setPrinters(list)
        setPrinterState('ready')
        setLayout((previous) => ({
          ...previous,
          printerName: list.some((printer) => printer.name === previous.printerName)
            ? previous.printerName
            : ''
        }))
      })
      .catch((reason: unknown) => {
        if (!alive) return
        setPrinters([])
        setPrinterState('error')
        setError(messageOf(reason))
      })
    return () => {
      alive = false
    }
  }, [open, doc.id])

  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const element = stageRef.current
    if (!element) return
    const update = (): void => {
      setStageSize({ width: element.clientWidth, height: element.clientHeight })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      const target = event.target as Node | null
      if (target && dialogRef.current?.contains(target)) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, busy, onClose])

  const derived = useMemo(() => {
    const parsed = parsePageRange(layout.rangeText, doc.pageCount)
    const pages = resolvePrintPages(doc.pageCount, layout)
    const sheets = buildPrintSheets(pages, layout.pagesPerSheet, layout.pageOrder, layout.orientation)
    const paper = paperSizeMm(layout.paperSize, layout.orientation)
    const margins = resolveMarginsMm(layout)
    const grid = gridForPagesPerSheet(layout.pagesPerSheet, layout.orientation)
    return {
      pages,
      sheets,
      paper,
      margins,
      grid,
      pageError: layout.selection === 'custom' ? parsed.error : null
    }
  }, [doc.pageCount, layout])

  useEffect(() => {
    setPreviewSheet((index) => Math.min(index, Math.max(0, derived.sheets.length - 1)))
  }, [derived.sheets.length])

  const paperPx = useMemo(() => {
    if (stageSize.width < 40 || stageSize.height < 40) {
      return { width: 0, height: 0 }
    }
    const scale = Math.min(
      (stageSize.width - 40) / derived.paper.widthMm,
      (stageSize.height - 40) / derived.paper.heightMm
    )
    return {
      width: Math.max(80, Math.round(derived.paper.widthMm * scale)),
      height: Math.max(80, Math.round(derived.paper.heightMm * scale))
    }
  }, [stageSize, derived.paper])

  const insets = useMemo(
    () => ({
      top: `${(derived.margins.top / derived.paper.heightMm) * 100}%`,
      right: `${(derived.margins.right / derived.paper.widthMm) * 100}%`,
      bottom: `${(derived.margins.bottom / derived.paper.heightMm) * 100}%`,
      left: `${(derived.margins.left / derived.paper.widthMm) * 100}%`
    }),
    [derived.margins, derived.paper]
  )

  const patch = useCallback(<K extends keyof PrintLayoutOptions>(
    key: K,
    value: PrintLayoutOptions[K]
  ): void => {
    setLayout((previous) => ({ ...previous, [key]: value }))
  }, [])

  const patchMargin = useCallback((side: keyof PrintLayoutOptions['marginsMm'], value: number): void => {
    const next = clamp(Number.isFinite(value) ? value : 0, 0, MAX_MARGIN_MM)
    setLayout((previous) => ({
      ...previous,
      marginsMm: { ...previous.marginsMm, [side]: next }
    }))
  }, [])

  const chooseCustomRange = useCallback((): void => {
    setLayout((previous) => ({
      ...previous,
      selection: 'custom',
      rangeText: previous.rangeText || String(previous.currentPage)
    }))
  }, [])

  const selectedPrinter = printers.find((printer) => printer.name === layout.printerName) ?? null
  const canPrint =
    !busy &&
    printerState === 'ready' &&
    printers.length > 0 &&
    derived.pages.length > 0 &&
    !derived.pageError

  const submit = useCallback(async (): Promise<void> => {
    if (!canPrint) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.adou.printDocument({
        id: doc.id,
        name: doc.name,
        pages: doc.pages,
        rotations,
        layout
      })
      if (result.ok) {
        onClose()
      } else {
        setError(result.error || '打印失败')
      }
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }, [canPrint, doc.id, doc.name, doc.pages, layout, onClose, rotations])

  if (!open) return null

  const currentSheet = derived.sheets[previewSheet] ?? []
  const previewPosition =
    derived.sheets.length === 0 ? 0 : Math.min(previewSheet + 1, derived.sheets.length)

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div
        className="print-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="print-dialog-head">
          <div className="print-dialog-title">
            <h2 id="print-title">打印</h2>
            <p title={doc.name}>{doc.name}</p>
          </div>
          <button className="about-close" onClick={onClose} disabled={busy} aria-label="关闭打印">
            <IconClose size={16} />
          </button>
        </header>

        <div className="print-dialog-body">
          <div className="print-settings" aria-busy={busy}>
            <section className="print-section">
              <h3>打印机</h3>
              <label className="print-field">
                <span>打印机</span>
                <select
                  data-print="printer"
                  value={layout.printerName}
                  disabled={printerState !== 'ready'}
                  onChange={(event) => patch('printerName', event.target.value)}
                >
                  {printerState === 'loading' ? <option value="">正在读取打印机…</option> : null}
                  {printerState === 'ready' && printers.length === 0 ? (
                    <option value="">未检测到打印机</option>
                  ) : null}
                  {printers.length > 0 ? <option value="">系统默认打印机</option> : null}
                  {printers.map((printer) => (
                    <option key={printer.name} value={printer.name}>
                      {printer.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="print-field">
                <span>打印份数</span>
                <input
                  data-print="copies"
                  type="number"
                  min={1}
                  max={99}
                  value={layout.copies}
                  onChange={(event) =>
                    patch('copies', clamp(Number.parseInt(event.target.value, 10) || 1, 1, 99))
                  }
                />
              </div>
              <label className="print-check">
                <input
                  data-print="gray"
                  type="checkbox"
                  checked={!layout.color}
                  onChange={(event) => patch('color', !event.target.checked)}
                />
                灰度打印
              </label>
              {printerState === 'loading' ? (
                <p className="print-note">正在读取系统中的打印机…</p>
              ) : null}
              {printerState === 'ready' && printers.length === 0 ? (
                <p className="print-note print-note-warn">未检测到打印机，请先在 Windows 设置中添加打印机。</p>
              ) : null}
            </section>

            <section className="print-section">
              <h3>页面范围</h3>
              <div className="print-choices">
                <label className="print-radio">
                  <input
                    data-print="selection-all"
                    type="radio"
                    name="print-selection"
                    checked={layout.selection === 'all'}
                    onChange={() => patch('selection', 'all')}
                  />
                  所有页面
                </label>
                <label className="print-radio">
                  <input
                    data-print="selection-current"
                    type="radio"
                    name="print-selection"
                    checked={layout.selection === 'current'}
                    onChange={() => patch('selection', 'current')}
                  />
                  当前页面（第 {layout.currentPage} 页）
                </label>
                <label className="print-radio print-radio-range">
                  <input
                    data-print="selection-custom"
                    type="radio"
                    name="print-selection"
                    checked={layout.selection === 'custom'}
                    onChange={chooseCustomRange}
                  />
                  页码范围
                  <input
                    data-print="range"
                    className="print-range-input"
                    value={layout.rangeText}
                    disabled={layout.selection !== 'custom'}
                    placeholder={`如 1-${doc.pageCount}`}
                    onChange={(event) => patch('rangeText', event.target.value)}
                    aria-label="页码范围"
                  />
                </label>
              </div>
              {derived.pageError ? (
                <p className="print-inline-error">
                  <IconAlert size={13} />
                  {derived.pageError}
                </p>
              ) : null}
              <div className="print-field">
                <span>奇偶页面</span>
                <select
                  data-print="parity"
                  value={layout.parity}
                  onChange={(event) => patch('parity', event.target.value as PrintLayoutOptions['parity'])}
                >
                  <option value="all">范围中所有页面</option>
                  <option value="odd">仅奇数页</option>
                  <option value="even">仅偶数页</option>
                </select>
              </div>
              <label className="print-check">
                <input
                  data-print="reverse"
                  type="checkbox"
                  checked={layout.reverse}
                  onChange={(event) => patch('reverse', event.target.checked)}
                />
                逆序打印
              </label>
              <p className="print-note">将打印 {derived.pages.length} 页</p>
            </section>

            <section className="print-section">
              <h3>打印方式</h3>
              <div className="print-segment">
                <button
                  type="button"
                  data-print="mode-single"
                  className={layout.pagesPerSheet === 1 ? 'active' : ''}
                  onClick={() => patch('pagesPerSheet', 1)}
                >
                  页面大小
                </button>
                <button
                  type="button"
                  data-print="mode-nup"
                  className={layout.pagesPerSheet > 1 ? 'active' : ''}
                  onClick={() => patch('pagesPerSheet', layout.pagesPerSheet > 1 ? layout.pagesPerSheet : 2)}
                >
                  一张多页
                </button>
              </div>
              {layout.pagesPerSheet > 1 ? (
                <div className="print-nup">
                  <div className="print-field">
                    <span>每张页数</span>
                    <select
                      data-print="per-sheet"
                      value={layout.pagesPerSheet}
                      onChange={(event) => patch('pagesPerSheet', Number(event.target.value))}
                    >
                      {PER_SHEET_OPTIONS.map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="print-field">
                    <span>排列</span>
                    <span className="print-static">
                      {derived.grid.cols} 列 × {derived.grid.rows} 行
                    </span>
                  </div>
                  <div className="print-field">
                    <span>页面顺序</span>
                    <div className="print-order">
                      <button
                        type="button"
                        data-print="order-row"
                        className={layout.pageOrder === 'row' ? 'active' : ''}
                        onClick={() => patch('pageOrder', 'row')}
                      >
                        按行 Z
                      </button>
                      <button
                        type="button"
                        data-print="order-column"
                        className={layout.pageOrder === 'column' ? 'active' : ''}
                        onClick={() => patch('pageOrder', 'column')}
                      >
                        按列 N
                      </button>
                    </div>
                  </div>
                  <label className="print-check">
                    <input
                      data-print="border"
                      type="checkbox"
                      checked={layout.printBorder}
                      onChange={(event) => patch('printBorder', event.target.checked)}
                    />
                    打印边框
                  </label>
                </div>
              ) : null}
            </section>

            <section className="print-section">
              <h3>页面设置</h3>
              <div className="print-field">
                <span>纸张大小</span>
                <select
                  data-print="paper"
                  value={layout.paperSize}
                  onChange={(event) => patch('paperSize', event.target.value as PrintLayoutOptions['paperSize'])}
                >
                  {PAPER_SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="print-field">
                <span>纸张方向</span>
                <div className="print-radio-inline">
                  <label className="print-radio">
                    <input
                      data-print="orientation-portrait"
                      type="radio"
                      name="print-orientation"
                      checked={layout.orientation === 'portrait'}
                      onChange={() => patch('orientation', 'portrait')}
                    />
                    纵向
                  </label>
                  <label className="print-radio">
                    <input
                      data-print="orientation-landscape"
                      type="radio"
                      name="print-orientation"
                      checked={layout.orientation === 'landscape'}
                      onChange={() => patch('orientation', 'landscape')}
                    />
                    横向
                  </label>
                </div>
              </div>
              <div className="print-field">
                <span>页边距</span>
                <select
                  data-print="margin-mode"
                  value={layout.marginMode}
                  onChange={(event) => patch('marginMode', event.target.value as PrintLayoutOptions['marginMode'])}
                >
                  <option value="default">默认（10 mm）</option>
                  <option value="none">无边距（0 mm）</option>
                  <option value="custom">自定义</option>
                </select>
              </div>
              {layout.marginMode === 'custom' ? (
                <div className="print-margins">
                  {(Object.keys(MARGIN_LABELS) as Array<keyof PrintLayoutOptions['marginsMm']>).map(
                    (side) => (
                      <label key={side}>
                        <span>{MARGIN_LABELS[side]}</span>
                        <input
                          data-print={`margin-${side}`}
                          type="number"
                          min={0}
                          max={MAX_MARGIN_MM}
                          value={layout.marginsMm[side]}
                          onChange={(event) => patchMargin(side, Number(event.target.value))}
                        />
                      </label>
                    )
                  )}
                </div>
              ) : null}
              <div className="print-field">
                <span>双面打印</span>
                <select
                  data-print="duplex"
                  value={layout.duplex}
                  onChange={(event) => patch('duplex', event.target.value as PrintLayoutOptions['duplex'])}
                >
                  <option value="simplex">单面</option>
                  <option value="longEdge">双面（长边翻页）</option>
                  <option value="shortEdge">双面（短边翻页）</option>
                </select>
              </div>
            </section>
          </div>

          <div className="print-preview">
            <div className="print-preview-head">
              <span>预览</span>
              <span className="print-sheet-summary">
                {derived.pages.length} 页 · {derived.sheets.length} 张
              </span>
            </div>
            <div className="print-preview-stage" ref={stageRef}>
              {derived.sheets.length === 0 ? (
                <div className="print-preview-empty">
                  {derived.pageError ?? '没有可打印的页面'}
                </div>
              ) : (
                <div
                  className={`print-paper ${layout.color ? '' : 'grayscale'}`}
                  style={{ width: paperPx.width || undefined, height: paperPx.height || undefined }}
                >
                  <div
                    className="print-paper-grid"
                    style={{
                      top: insets.top,
                      right: insets.right,
                      bottom: insets.bottom,
                      left: insets.left,
                      gridTemplateColumns: `repeat(${derived.grid.cols}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${derived.grid.rows}, minmax(0, 1fr))`,
                      gap: layout.pagesPerSheet > 1 ? '2%' : '0'
                    }}
                  >
                    {currentSheet.map((page, index) => (
                      <div
                        key={`${previewSheet}-${index}-${page}`}
                        className={`print-cell${layout.printBorder ? ' bordered' : ''}`}
                      >
                        {page > 0 ? (
                          <>
                            <img
                              data-page={page}
                              data-rotation={rotationOf(rotations, page) || undefined}
                              src={pageImageUrl(
                                backend,
                                doc.id,
                                page,
                                96,
                                rotationOf(rotations, page)
                              )}
                              alt={`第 ${page} 页`}
                              draggable={false}
                            />
                            <span className="print-cell-label">{page}</span>
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="print-preview-nav">
              <button
                type="button"
                className="print-nav-btn"
                disabled={previewSheet <= 0 || derived.sheets.length === 0}
                onClick={() => setPreviewSheet((index) => Math.max(0, index - 1))}
                aria-label="上一张"
              >
                <IconChevronLeft size={15} />
              </button>
              <span data-print="sheet-position">
                第 {previewPosition} / {derived.sheets.length} 张
              </span>
              <button
                type="button"
                className="print-nav-btn"
                disabled={previewSheet >= derived.sheets.length - 1}
                onClick={() =>
                  setPreviewSheet((index) => Math.min(derived.sheets.length - 1, index + 1))
                }
                aria-label="下一张"
              >
                <IconChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>

        <footer className="print-dialog-foot">
          <span className="print-foot-note">
            {printerState === 'ready' && printers.length > 0
              ? layout.printerName
                ? `直接发送到 ${selectedPrinter?.displayName ?? layout.printerName}`
                : '直接发送到系统默认打印机'
              : printerState === 'loading'
                ? '正在读取打印机…'
                : '未检测到可用打印机'}
          </span>
          <span className="print-foot-spacer" />
          {error ? (
            <span className="print-error" role="alert">
              <IconAlert size={13} />
              {error}
            </span>
          ) : null}
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
            disabled={busy}
            data-print="cancel"
          >
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void submit()}
            disabled={!canPrint}
            data-print="submit"
          >
            {busy ? <span className="btn-spinner" /> : <IconPrint size={15} />}
            {busy ? '正在打印…' : '打印'}
          </button>
        </footer>
      </div>
    </div>
  )
}
