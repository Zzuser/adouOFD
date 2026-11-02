import type {
  ApiError,
  BackendInfo,
  ConversionJob,
  ConversionStart,
  DocumentSummary,
  EngineHealth,
  MergeJob,
  MergeStart,
  OutlineItem,
  ProbeResult,
  SearchJob,
  TextRun
} from '@shared/types'

export class ApiRequestError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.status = status
  }
}

function baseUrl(info: BackendInfo): string {
  if (!info.port) {
    throw new Error('本地引擎尚未就绪')
  }
  return `http://127.0.0.1:${info.port}`
}

async function readError(response: Response): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as Partial<ApiError>
    return new ApiRequestError(
      body.message ?? `请求失败（HTTP ${response.status}）`,
      body.code ?? 'UNKNOWN',
      response.status
    )
  } catch {
    return new ApiRequestError(`请求失败（HTTP ${response.status}）`, 'UNKNOWN', response.status)
  }
}

const DEFAULT_TIMEOUT_MS = 20_000

function timeoutSignal(init: RequestInit): AbortSignal {
  return init.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  )
}

async function request<T>(info: BackendInfo, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (info.token) headers.set('X-ADou-Token', info.token)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(`${baseUrl(info)}${path}`, {
      ...init,
      headers,
      signal: timeoutSignal(init)
    })
  } catch (error) {
    if (isTimeout(error)) {
      throw new Error('本地引擎响应超时，请稍后重试')
    }
    throw error
  }
  if (!response.ok) {
    throw await readError(response)
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

export function startSearch(
  info: BackendInfo,
  id: string,
  query: string,
  caseSensitive: boolean
): Promise<SearchJob> {
  return request<SearchJob>(info, `/api/documents/${encodeURIComponent(id)}/searches`, {
    method: 'POST',
    body: JSON.stringify({ query, caseSensitive })
  })
}

export function fetchSearch(info: BackendInfo, id: string, searchId: string): Promise<SearchJob> {
  return request<SearchJob>(
    info,
    `/api/documents/${encodeURIComponent(id)}/searches/${encodeURIComponent(searchId)}`
  )
}

export function cancelSearch(
  info: BackendInfo,
  id: string,
  searchId: string
): Promise<SearchJob> {
  return request<SearchJob>(
    info,
    `/api/documents/${encodeURIComponent(id)}/searches/${encodeURIComponent(searchId)}/cancel`,
    { method: 'POST' }
  )
}

export async function closeDocument(info: BackendInfo, id: string): Promise<void> {  const headers = new Headers()
  if (info.token) headers.set('X-ADou-Token', info.token)
  const response = await fetch(`${baseUrl(info)}/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers
  })
  if (!response.ok) {
    throw await readError(response)
  }
}

export function probeFiles(info: BackendInfo, paths: string[]): Promise<ProbeResult[]> {
  return request<ProbeResult[]>(info, '/api/conversions/probe', {
    method: 'POST',
    body: JSON.stringify({ paths })
  })
}

export function startConversion(info: BackendInfo, payload: ConversionStart): Promise<ConversionJob> {
  return request<ConversionJob>(info, '/api/conversions', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchConversion(info: BackendInfo, id: string): Promise<ConversionJob> {
  return request<ConversionJob>(info, `/api/conversions/${encodeURIComponent(id)}`)
}

export function cancelConversion(info: BackendInfo, id: string): Promise<ConversionJob> {
  return request<ConversionJob>(info, `/api/conversions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST'
  })
}

export function startMerge(info: BackendInfo, payload: MergeStart): Promise<MergeJob> {
  return request<MergeJob>(info, '/api/merges', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchMerge(info: BackendInfo, id: string): Promise<MergeJob> {
  return request<MergeJob>(info, `/api/merges/${encodeURIComponent(id)}`)
}

export function cancelMerge(info: BackendInfo, id: string): Promise<MergeJob> {
  return request<MergeJob>(info, `/api/merges/${encodeURIComponent(id)}/cancel`, {
    method: 'POST'
  })
}

export function pageImageUrl(info: BackendInfo, id: string, page: number, dpi = 144): string {  const token = info.token ? encodeURIComponent(info.token) : ''
  return `${baseUrl(info)}/api/documents/${encodeURIComponent(id)}/pages/${page}?dpi=${dpi}&token=${token}`
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
