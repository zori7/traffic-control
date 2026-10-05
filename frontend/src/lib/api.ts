const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

type ValidationDetail = { msg?: string; loc?: (string | number)[] }

function extractMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const detail = (payload as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const first = detail[0] as ValidationDetail | undefined
    if (first?.msg) {
      const field = first.loc?.filter((part) => part !== 'body').join('.')
      return field ? `${field}: ${first.msg}` : first.msg
    }
  }
  return fallback
}

/**
 * Thin fetch wrapper. Always sends cookies, normalises errors into ApiError,
 * and treats 204 as an empty body.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    if (!response.ok) throw new ApiError(response.status, response.statusText)
    return undefined as T
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(payload, response.statusText), payload)
  }

  return payload as T
}