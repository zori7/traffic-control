const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

const REFRESH_PATH = '/auth/refresh'

// Requests that must never trigger a refresh-and-retry: the session endpoints
// themselves.
const NO_REFRESH_PATHS = new Set([REFRESH_PATH, '/auth/login', '/auth/register'])

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

type SessionListener = () => void

const refreshedListeners = new Set<SessionListener>()
const expiredListeners = new Set<SessionListener>()

/** Runs after the access token has been silently refreshed. */
export function onAuthRefreshed(listener: SessionListener): () => void {
  refreshedListeners.add(listener)
  return () => refreshedListeners.delete(listener)
}

/** Runs when a refresh attempt is rejected — the session is over. */
export function onAuthExpired(listener: SessionListener): () => void {
  expiredListeners.add(listener)
  return () => expiredListeners.delete(listener)
}

let refreshInFlight: Promise<boolean> | null = null

/**
 * Rotate the session using the HttpOnly refresh cookie. Concurrent 401s share
 * a single in-flight refresh, which matters because the backend rotates the
 * refresh token on every call (a second, parallel refresh would use a stale
 * token and fail).
 */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function doRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}${REFRESH_PATH}`, {
      method: 'POST',
      credentials: 'include',
    })
    if (response.ok) {
      refreshedListeners.forEach((listener) => listener())
      return true
    }
    // A rejected refresh means the session is gone; a network error does not.
    if (response.status === 401 || response.status === 403) {
      expiredListeners.forEach((listener) => listener())
    }
    return false
  } catch {
    return false
  }
}

async function send<T>(path: string, options: RequestInit, allowRefresh: boolean): Promise<T> {
  const response = await request(path, options, allowRefresh)

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

/** Fetch with credentials, refreshing an expired token once (shared by send/file). */
async function request(
  path: string,
  options: RequestInit,
  allowRefresh: boolean,
): Promise<Response> {
  const headers = new Headers(options.headers)
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  })

  if (response.status === 401 && allowRefresh && !NO_REFRESH_PATHS.has(path)) {
    if (await refreshSession()) return request(path, options, false)
  }

  return response
}

/** Extract the filename from a Content-Disposition header, if present. */
function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(value)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Like apiFetch, but for file downloads: returns the raw response as a Blob
 * together with the server-suggested filename. Errors are still normalised
 * into ApiError.
 */
export async function apiFetchFile(
  path: string,
  options: RequestInit = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await request(path, options, true)
  if (!response.ok) {
    const isJson = response.headers.get('content-type')?.includes('application/json')
    const payload = isJson ? await response.json() : await response.text()
    throw new ApiError(response.status, extractMessage(payload, response.statusText), payload)
  }
  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('content-disposition')),
  }
}

/**
 * Thin fetch wrapper. Always sends cookies, refreshes an expired access token
 * once and retries, normalises errors into ApiError, and treats 204 as an
 * empty body.
 */
export function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return send<T>(path, options, true)
}
