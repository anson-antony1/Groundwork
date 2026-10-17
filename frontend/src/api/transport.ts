import { API_MODE } from './config'

export interface ApiRequest {
  method: 'GET' | 'POST'
  /** Absolute API path, e.g. /api/v1/sites. */
  path: string
  query?: Record<string, string | number | boolean | null | undefined>
  json?: unknown
  form?: FormData
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface ApiResponse {
  status: number
  body: unknown
  /** Lower-cased header names. */
  headers: Record<string, string>
}

export type Transport = (req: ApiRequest) => Promise<ApiResponse>

let transport: Promise<Transport> | undefined

/**
 * The HTTP transport in live mode; the in-browser mock backend in mock mode.
 * Mocks are imported only here, dynamically, so live builds never run them.
 */
export function getTransport(): Promise<Transport> {
  transport ??=
    API_MODE === 'mock'
      ? import('../mocks/transport').then((m) => m.mockTransport)
      : import('./http').then((m) => m.httpTransport)
  return transport
}
