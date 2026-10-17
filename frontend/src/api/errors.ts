import type { DataMode } from './types'

export interface ApiErrorInit {
  status: number
  code: string
  message: string
  details?: { field?: string | null; issue: string }[]
  requestId?: string | null
  retryAfterSec?: number | null
}

/** A failed API call, parsed from the backend's {"error": {...}} shape. status 0 = network/timeout. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: { field?: string | null; issue: string }[]
  readonly requestId: string | null
  readonly retryAfterSec: number | null

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.details = init.details ?? []
    this.requestId = init.requestId ?? null
    this.retryAfterSec = init.retryAfterSec ?? null
  }

  /** Network down, timeout, 5xx or 429: worth retrying. 4xx means the request itself is wrong. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }

  static fromResponse(status: number, body: unknown, headers: Record<string, string>): ApiError {
    const err = (body as { error?: Partial<ApiErrorInit> & { request_id?: string; details?: ApiErrorInit['details'] } } | null)?.error
    const retryAfter = Number(headers['retry-after'])
    return new ApiError({
      status,
      code: err?.code ?? `HTTP_${status}`,
      message: err?.message ?? `Request failed with status ${status}`,
      details: err?.details ?? [],
      requestId: err?.request_id ?? headers['x-request-id'] ?? null,
      retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : null,
    })
  }
}

/**
 * A response whose envelope `mode` belongs to the other context (live vs historical replay),
 * e.g. a request that raced a replay start. It is dropped instead of rendered.
 */
export class ContextMismatchError extends Error {
  readonly expectedReplay: boolean
  readonly mode: DataMode

  constructor(expectedReplay: boolean, mode: DataMode) {
    super(`Expected ${expectedReplay ? 'replay' : 'live'} data but got mode "${mode}"`)
    this.name = 'ContextMismatchError'
    this.expectedReplay = expectedReplay
    this.mode = mode
  }
}

/** Short human message for error states. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.code === 'TIMEOUT' ? 'The API did not answer in time.' : 'Cannot reach the API.'
    if (error.status === 429) return `Rate limited${error.retryAfterSec ? `; retrying in ${error.retryAfterSec} s` : ''}.`
    return error.message
  }
  if (error instanceof ContextMismatchError) return 'Switching between live and replay data…'
  return error instanceof Error ? error.message : 'Something went wrong.'
}
