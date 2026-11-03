import { app, dialog, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { TextPdfExportResult } from '../shared/types'

export async function exportTextPdf(
  window: BrowserWindow,
  rawOptions: unknown
): Promise<TextPdfExportResult> {
  try {
    const value = (rawOptions ?? {}) as Record<string, unknown>
    const sourcePath =
      typeof value.sourcePath === 'string' && value.sourcePath.trim()
        ? resolve(value.sourcePath.trim())
        : ''
    const base = sourcePath
      ? basename(sourcePath).replace(/\.[^.]+$/, '') || 'Markdown 导出'
      : 'Markdown 导出'
    const preferredDir = sourcePath ? dirname(sourcePath) : app.getPath('documents')
    const autoTarget = process.env.ADOU_TEST_EXPORT_PDF
    let target = typeof autoTarget === 'string' ? autoTarget.trim() : ''
    if (!target) {
      const options: Electron.SaveDialogOptions = {
        title: '导出为 PDF',
        buttonLabel: '导出',
        defaultPath: join(preferredDir, `${base}.pdf`),
        filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
      }
      const result = await dialog.showSaveDialog(window, options)
      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true }
      }
      target = result.filePath
    }
    if (!target.toLowerCase().endsWith('.pdf')) target += '.pdf'
    window.setBackgroundColor('#ffffff')
    let pdf: Buffer
    try {
      pdf = await window.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: true
      })
    } finally {
      window.setBackgroundColor('#f6f4ec')
    }
    writeFileSync(target, pdf)
    return { ok: true, path: resolve(target), size: pdf.length }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '导出 PDF 失败'
    }
  }
}
