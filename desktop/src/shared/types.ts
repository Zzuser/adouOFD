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

export interface AppVersions {
  app: string
  electron: string
  chrome: string
  node: string
}

export interface AdouApi {
  getBackendInfo(): Promise<BackendInfo>
  restartBackend(): Promise<BackendInfo>
  onBackendStatus(callback: (info: BackendInfo) => void): () => void
  pickDocument(): Promise<string | null>
  getPathForFile(file: unknown): string
  revealPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  getVersions(): Promise<AppVersions>
}
