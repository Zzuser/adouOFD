import type { RotationMap } from './rotation'
import type { TextEncoding, TextEol, TextKind } from './text-paths'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export type BackendStatus = 'starting' | 'ready' | 'error' | 'stopped'

export interface BackendInfo {
  status: BackendStatus
  port: number | null
  token: string | null
  message?: string
  logPath?: string
}

export interface EngineHealth {
  status: string
  app: string
  version: string
  javaVersion: string
  ofdrwVersion: string
  runtime: string
  os: string
  startedAt: string
}

export interface PageMeta {
  index: number
  widthMm: number
  heightMm: number
}

export interface OutlineItem {
  title: string
  page: number | null
  level: number
}

export interface TextRun {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
}

export type SearchStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'

export interface SearchHit {
  page: number
  start: number
  end: number
  before: string
  match: string
  after: string
  beforeTruncated: boolean
  afterTruncated: boolean
  x: number
  y: number
  height: number
}

export interface SearchJob {
  id: string
  documentId: string
  status: SearchStatus
  query: string
  caseSensitive: boolean
  totalPages: number
  scannedPages: number
  progress: number
  matchCount: number
  truncated: boolean
  failedPages: number
  hits: SearchHit[]
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  finishedAt: string | null
}

export interface DocumentSummary {
  id: string
  name: string
  path: string
  size: number
  kind: string
  pageCount: number
  signed: boolean
  demo: boolean
  pages: PageMeta[]
}

export type RecentFileKind = 'OFD' | 'PDF' | TextKind
export type NewTextKind = 'md' | 'txt'

export interface RecentFile {
  path: string
  name: string
  kind: RecentFileKind
  pageCount: number
  openedAt: number
}

export interface RecentFileInput {
  path: string
  name: string
  kind: RecentFileKind
  pageCount: number
}

export interface TextFileData {
  path: string
  name: string
  content: string
  encoding: TextEncoding
  eol: TextEol
  size: number
  modifiedAt: number
}

export interface TextFileWriteOptions {
  path: string
  content: string
  encoding: TextEncoding
  eol: TextEol
  expectedModifiedAt?: number | null
}

export interface TextFileWriteResult {
  ok: boolean
  code?: 'CONFLICT' | 'IO_ERROR'
  message?: string
  size?: number
  modifiedAt?: number
  onDiskModifiedAt?: number
}

export interface TextPdfExportResult {
  ok: boolean
  canceled?: boolean
  path?: string
  size?: number
  error?: string
}

export interface SignatureInfo {
  name: string | null
  reason: string | null
  location: string | null
  signTime: string | null
}

export interface DocumentProperties {
  summary: DocumentSummary
  metadata: Record<string, string>
  signatures: SignatureInfo[]
  warning: string | null
}

export interface ApiError {
  code: string
  message: string
  detail?: string | null
}

export type ConversionStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED'

export interface ConversionReport {
  sourcePages: number
  outputPages: number
  outputBytes: number
  durationMs: number
  warnings: string[]
}

export interface ConversionJob {
  id: string
  status: ConversionStatus
  progress: number
  phase: string
  sourcePath: string
  sourceName: string
  sourceKind: string
  sourcePages: number
  target: string
  outputPath: string
  outputName: string
  report: ConversionReport | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface ConversionStart {
  documentId?: string
  sourcePath?: string
  target: string
  outputPath: string
  overwrite?: boolean
}

export interface ConversionTargetOptions {
  sourcePath: string
  target: string
}

export interface ProbeResult {
  path: string
  name: string
  size: number
  kind: string
  pages: number
  error: string | null
}

export interface MergeReport {
  sourceFiles: number
  sourcePages: number
  outputPages: number
  outputBytes: number
  durationMs: number
  warnings: string[]
}

export interface MergeJob {
  id: string
  status: ConversionStatus
  progress: number
  phase: string
  target: string
  outputPath: string
  outputName: string
  fileCount: number
  sourcePages: number
  report: MergeReport | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export type MergePdfMode = 'AUTO' | 'VECTOR' | 'IMAGE'

export interface MergeStart {
  files: string[]
  target: string
  outputPath: string
  overwrite?: boolean
  pdfMode?: MergePdfMode
}

export interface MergeTargetOptions {
  target: string
}

export type SplitMode = 'PAGE' | 'CHUNK' | 'RANGES'
export type InsertPositionMode = 'START' | 'BEFORE' | 'END'

export interface PageOutput {
  path: string
  name: string
  pages: number
}

export interface PageToolJob {
  id: string
  operation: 'SPLIT' | 'INSERT'
  status: ConversionStatus
  progress: number
  phase: string
  sourcePath: string
  sourceName: string
  sourcePages: number
  insertPath: string | null
  insertName: string | null
  insertPages: number
  outputPath: string | null
  outputName: string | null
  outputDir: string | null
  outputs: PageOutput[]
  outputPages: number
  outputFiles: number
  outputBytes: number
  warnings: string[]
  errorCode: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface SplitStart {
  sourcePath: string
  mode: SplitMode
  pagesPerFile?: number
  ranges?: string
  outputDir: string
  baseName?: string
}

export interface InsertStart {
  basePath: string
  insertPath: string
  insertRanges?: string
  positionMode: InsertPositionMode
  position?: number
  outputPath: string
  overwrite?: boolean
}

export interface PageOutputTargetOptions {
  target: string
  defaultName?: string
}

export interface AppVersions {
  app: string
  electron: string
  chrome: string
  node: string
}

export interface UpdateDownload {
  url: string
  size: number
  sha256: string
}

export interface UpdateManifest {
  version: string
  channel?: string
  publishedAt?: string
  minVersion?: string
  notesUrl?: string
  notes: string[]
  downloads: Record<string, UpdateDownload>
}

export interface UpdateCheckResult {
  currentVersion: string
  updateAvailable: boolean
  manifest: UpdateManifest | null
  download: UpdateDownload | null
  error: string | null
}

export interface UpdateDownloadResult {
  ok: boolean
  path?: string
  error?: string
}

export interface UpdateProgress {
  received: number
  total: number
}

export interface WindowsIntegrationStatus {
  supported: boolean
  packaged: boolean
  canRegister: boolean
  registered: boolean
  ofdOpenWith: boolean
  pdfOpenWith: boolean
  mdOpenWith: boolean
  ofdDefault: boolean
  pdfDefault: boolean
  mdDefault: boolean
  optedOut: boolean
}

export interface LegalNotices {
  thirdParty: string
  license: string
  privacy: string
  noticesDir: string
}

export type PrintPaperSize =
  | 'A3'
  | 'A4'
  | 'A5'
  | 'A6'
  | 'B5'
  | 'Letter'
  | 'Legal'
  | 'Tabloid'

export type PrintOrientation = 'portrait' | 'landscape'
export type PrintPageSelection = 'all' | 'current' | 'custom'
export type PrintParity = 'all' | 'odd' | 'even'
export type PrintPageOrder = 'row' | 'column'
export type PrintDuplex = 'simplex' | 'longEdge' | 'shortEdge'
export type PrintMarginMode = 'default' | 'none' | 'custom'

export interface PrintMarginsMm {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PrintLayoutOptions {
  printerName: string
  copies: number
  color: boolean
  selection: PrintPageSelection
  currentPage: number
  rangeText: string
  parity: PrintParity
  reverse: boolean
  paperSize: PrintPaperSize
  orientation: PrintOrientation
  marginMode: PrintMarginMode
  marginsMm: PrintMarginsMm
  duplex: PrintDuplex
  pagesPerSheet: number
  pageOrder: PrintPageOrder
  printBorder: boolean
}

export interface PrinterInfo {
  name: string
  displayName: string
}

export interface PrintDocumentOptions {
  id: string
  name: string
  pages: PageMeta[]
  rotations: RotationMap
  layout: PrintLayoutOptions
}

export interface PrintDocumentResult {
  ok: boolean
  canceled?: boolean
  error?: string
  pages?: number
  sheets?: number
  dpi?: number
  testPdf?: string
}

export interface AdouApi {
  getBackendInfo(): Promise<BackendInfo>
  restartBackend(): Promise<BackendInfo>
  onBackendStatus(callback: (info: BackendInfo) => void): () => void
  pickDocument(): Promise<string | null>
  pickDocuments(): Promise<string[]>
  pickConversionTarget(options: ConversionTargetOptions): Promise<string | null>
  pickMergeTarget(options: MergeTargetOptions): Promise<string | null>
  pickPageTarget(options: PageOutputTargetOptions): Promise<string | null>
  pickDirectory(options?: { title?: string }): Promise<string | null>
  getPathForFile(file: unknown): string
  revealPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  getVersions(): Promise<AppVersions>
  checkUpdate(): Promise<UpdateCheckResult>
  downloadUpdate(download: UpdateDownload): Promise<UpdateDownloadResult>
  cancelUpdateDownload(): Promise<void>
  installUpdate(path: string): Promise<UpdateDownloadResult>
  onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void
  takePendingFiles(): Promise<string[]>
  onOpenFiles(callback: () => void): () => void
  getWindowsIntegration(): Promise<WindowsIntegrationStatus>
  registerWindowsIntegration(): Promise<WindowsIntegrationStatus>
  unregisterWindowsIntegration(): Promise<WindowsIntegrationStatus>
  openAppDefaultSettings(): Promise<void>
  readLegalNotices(): Promise<LegalNotices>
  revealLegalNotices(): Promise<void>
  listPrinters(): Promise<PrinterInfo[]>
  printDocument(options: PrintDocumentOptions): Promise<PrintDocumentResult>
  listRecentFiles(): Promise<RecentFile[]>
  addRecentFile(entry: RecentFileInput): Promise<RecentFile[]>
  removeRecentFile(path: string): Promise<RecentFile[]>
  clearRecentFiles(): Promise<void>
  readTextFile(path: string): Promise<TextFileData>
  writeTextFile(options: TextFileWriteOptions): Promise<TextFileWriteResult>
  createTextFile(kind: NewTextKind): Promise<string | null>
  exportTextPdf(options: { sourcePath: string }): Promise<TextPdfExportResult>
  setUnsavedTextCount(count: number): void
  setThemeSource(preference: ThemePreference): void
}
