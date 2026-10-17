import { accessToken } from '../auth/token'
import { API_BASE } from './config'
import { ApiError } from './errors'
import type { Transport } from './transport'

const TIMEOUT_MS = 8000

/** 16 hex chars for X-Request-ID. getRandomValues works on plain-http LAN pages, unlike randomUUID. */
function requestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const httpTransport: Transport = async (req) => {
  const url = new URL(`${API_BASE}${req.path}`, window.location.origin)
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }

  const headers: Record<string, string> = { Accept: 'application/json', 'X-Request-ID': requestId(), ...req.headers }
  // Writes carry the logged-in user's Auth0 token (the backend guards writes by role). Reads never wait
  // on Auth0, so the dashboard keeps working if the venue network can't reach it. A caller's own
  // Authorization header (the sensor token in the reset dialog) wins.
  if (req.method !== 'GET' && !headers.Authorization) {
    const token = await accessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  let body: BodyInit | undefined
  if (req.form) {
    body = req.form // the browser sets the multipart boundary
  } else if (req.json !== undefined) {
    body = JSON.stringify(req.json)
    headers['Content-Type'] = 'application/json'
  }

  const timeoutMs = req.timeoutMs ?? TIMEOUT_MS
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout

  let res: Response
  try {
    res = await fetch(url, { method: req.method, headers, body, signal })
  } catch (error) {
    if (req.signal?.aborted) throw error // cancelled by the caller (e.g. TanStack Query): not an API failure
    const timedOut = timeout.aborted
    throw new ApiError({
      status: 0,
      code: timedOut ? 'TIMEOUT' : 'NETWORK',
      message: timedOut ? `No response within ${timeoutMs / 1000} s` : 'Network error: the API is unreachable',
    })
  }

  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }
  const responseHeaders: Record<string, string> = {}
  res.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value
  })
  return { status: res.status, body: parsed, headers: responseHeaders }
}
