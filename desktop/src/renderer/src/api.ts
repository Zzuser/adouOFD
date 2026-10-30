import type {
  ApiError,
  BackendInfo,
  DocumentSummary,
  EngineHealth,
  OutlineItem,
  TextRun
} from '@shared/types'

function baseUrl(info: BackendInfo): string {
  if (!info.port) {
    throw new Error('本地引擎尚未就绪')
  }
  return `http://127.0.0.1:${info.port}`
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ApiError>
    if (body.message) return body.message
  } catch {
    // 非 JSON 错误响应，使用状态码兜底
  }
  return `请求失败（HTTP ${response.status}）`
}

async function request<T>(info: BackendInfo, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (info.token) headers.set('X-ADou-Token', info.token)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`${baseUrl(info)}${path}`, { ...init, headers })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return (await response.json()) as T
}

export function fetchHealth(info: BackendInfo): Promise<EngineHealth> {
  return request<EngineHealth>(info, '/api/health')
}

export function openDocument(info: BackendInfo, path: string): Promise<DocumentSummary> {
  return request<DocumentSummary>(info, '/api/documents/open', {
    method: 'POST',
    body: JSON.stringify({ path })
  })
}

export function openDemo(info: BackendInfo): Promise<DocumentSummary> {
  return request<DocumentSummary>(info, '/api/documents/demo', { method: 'POST' })
}

export function openPdfDemo(info: BackendInfo): Promise<DocumentSummary> {
  return request<DocumentSummary>(info, '/api/documents/demo/pdf', { method: 'POST' })
}

export function fetchOutline(info: BackendInfo, id: string): Promise<OutlineItem[]> {
  return request<OutlineItem[]>(info, `/api/documents/${encodeURIComponent(id)}/outline`)
}

export function fetchPageText(
  info: BackendInfo,
  id: string,
  page: number,
  signal?: AbortSignal
): Promise<TextRun[]> {
  return request<TextRun[]>(
    info,
    `/api/documents/${encodeURIComponent(id)}/pages/${page}/text`,
    { signal }
  )
}

export async function closeDocument(info: BackendInfo, id: string): Promise<void> {
  const headers = new Headers()
  if (info.token) headers.set('X-ADou-Token', info.token)
  const response = await fetch(`${baseUrl(info)}/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
}

export function pageImageUrl(info: BackendInfo, id: string, page: number, dpi = 144): string {
  const token = info.token ? encodeURIComponent(info.token) : ''
  return `${baseUrl(info)}/api/documents/${encodeURIComponent(id)}/pages/${page}?dpi=${dpi}&token=${token}`
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
