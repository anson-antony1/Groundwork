import { ENDPOINTS } from './endpoints.gen'

export type ApiMode = 'mock' | 'live'

/** The one-line switch: VITE_API_MODE=live in frontend/.env.local talks to the real backend. */
export const API_MODE: ApiMode = import.meta.env.VITE_API_MODE === 'live' ? 'live' : 'mock'

/** The public Render build of the live app, where one backend is shared by every visitor. */
export const HOSTED = import.meta.env.VITE_HOSTED === '1'

/** The public mock-mode demo site: the rehearsal controls get a visible launcher for remote judges. */
export const TRY_DOCK = import.meta.env.VITE_TRY_DOCK === '1'

/** Empty means same origin; the Vite dev server proxies /api and /uploads to the backend. */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const API_PREFIX = '/api/v1'

/** The tabletop demo site and its beacon (backend config.py). */
export const DEMO_SITE_ID = 'DEMO-TRAY'
export const DEMO_DEVICE_ID = 'tray-01'

/**
 * True when the backend serves `endpoint` ("METHOD /api/v1/path"), per the generated contract.
 * Features built on proposed endpoints stay hidden in live mode until Aashita ships them;
 * the mock backend implements them so the UI can be built now.
 */
export function hasEndpoint(endpoint: string): boolean {
  return API_MODE === 'mock' || ENDPOINTS.includes(endpoint)
}

/** Resolves a backend asset path such as /uploads/report-1.jpg; passes through absolute and blob URLs. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^(https?:|blob:|data:)/.test(path)) return path
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}
