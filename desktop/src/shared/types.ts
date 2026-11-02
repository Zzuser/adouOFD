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
  springBootVersion: string
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

export interface MergeStart {
  files: string[]
  target: string
  outputPath: string
  overwrite?: boolean
}

export interface MergeTargetOptions {
  target: string
}

export interface AppVersions {
  app: string
  electron: string
  chrome: string
  node: string
}

export interface WindowsIntegrationStatus {
  supported: boolean
  packaged: boolean
  canRegister: boolean
  registered: boolean
  ofdDefault: boolean
  pdfDefault: boolean
  optedOut: boolean
}

export interface LegalNotices {
  thirdParty: string
  license: string
  noticesDir: string
}

export interface AdouApi {
  getBackendInfo(): Promise<BackendInfo>
  restartBackend(): Promise<BackendInfo>
  onBackendStatus(callback: (info: BackendInfo) => void): () => void
  pickDocument(): Promise<string | null>
  pickDocuments(): Promise<string[]>
  pickConversionTarget(options: ConversionTargetOptions): Promise<string | null>
  pickMergeTarget(options: MergeTargetOptions): Promise<string | null>
  pickDirectory(): Promise<string | null>
  getPathForFile(file: unknown): string
  revealPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  getVersions(): Promise<AppVersions>
  takePendingFiles(): Promise<string[]>
  onOpenFiles(callback: () => void): () => void
  getWindowsIntegration(): Promise<WindowsIntegrationStatus>
  registerWindowsIntegration(): Promise<WindowsIntegrationStatus>
  unregisterWindowsIntegration(): Promise<WindowsIntegrationStatus>
  openDefaultAppChoice(): Promise<void>
  openDefaultAppsSettings(): Promise<void>
  readLegalNotices(): Promise<LegalNotices>
  revealLegalNotices(): Promise<void>
}
