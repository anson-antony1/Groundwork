// Typed functions for every endpoint the UI uses (README §10). Each returns the full envelope,
// because screens show its mode, sources, missing_fields and errors alongside the data.
import { API_PREFIX } from './config'
import { ApiError } from './errors'
import type { BriefingView, DisplayView, ReplayScenario, ReportReviewInput, ReportView, SiteDetailView, SiteView } from './proposed'
import { getTransport } from './transport'
import type { ApiRequest } from './transport'
import type {
  DemoResetResult,
  DeviceEvent,
  Envelope,
  Evaluation,
  EvaluationInput,
  Health,
  PageEnvelope,
  Policy,
  Reading,
  Replay,
  ReportCategory,
  TimelineEvent,
} from './types'

async function call<T>(req: ApiRequest): Promise<T> {
  const transport = await getTransport()
  const res = await transport(req)
  if (res.status >= 200 && res.status < 300) return res.body as T
  throw ApiError.fromResponse(res.status, res.body, res.headers)
}

const P = API_PREFIX
const seg = encodeURIComponent

/** Larger than any realistic site count: the API defaults to 50 per page, which would silently drop sites. */
export const SITE_PAGE_LIMIT = 500

export interface NewReport {
  site_id: string
  description: string
  category_user: ReportCategory
  /** Already validated (JPEG/PNG, ≤ 5 MB) by domain/upload. */
  photo?: Blob | null
}

export const api = {
  health: (signal?: AbortSignal) => call<Envelope<Health>>({ method: 'GET', path: `${P}/health`, signal }),

  sites: (signal?: AbortSignal) =>
    call<PageEnvelope<SiteView>>({ method: 'GET', path: `${P}/sites`, query: { limit: SITE_PAGE_LIMIT }, signal }),

  site: (siteId: string, signal?: AbortSignal) =>
    call<Envelope<SiteDetailView>>({ method: 'GET', path: `${P}/sites/${seg(siteId)}`, signal }),

  evaluate: (siteId: string, input: EvaluationInput, signal?: AbortSignal) =>
    call<Envelope<Evaluation>>({ method: 'POST', path: `${P}/sites/${seg(siteId)}/evaluate`, json: input, signal }),

  latestReading: (deviceId: string, signal?: AbortSignal) =>
    call<Envelope<Reading>>({ method: 'GET', path: `${P}/sensors/${seg(deviceId)}/latest`, signal }),

  readingHistory: (deviceId: string, limit = 300, signal?: AbortSignal) =>
    call<PageEnvelope<Reading>>({ method: 'GET', path: `${P}/sensors/${seg(deviceId)}/history`, query: { limit }, signal }),

  /** Flat payload: the backend sends display state without the envelope (README §5.8). */
  display: (deviceId: string, signal?: AbortSignal) =>
    call<DisplayView>({ method: 'GET', path: `${P}/devices/${seg(deviceId)}/display`, signal }),

  /** Supervisor clears a crew flag raised from the beacon button; returns the updated display. */
  clearCrewFlag: (deviceId: string) => call<Envelope<DisplayView>>({ method: 'DELETE', path: `${P}/devices/${seg(deviceId)}/crew-flag` }),

  deviceEvents: (deviceId: string, limit = 50, signal?: AbortSignal) =>
    call<PageEnvelope<DeviceEvent>>({ method: 'GET', path: `${P}/devices/${seg(deviceId)}/events`, query: { limit }, signal }),

  reports: (siteId?: string, signal?: AbortSignal) =>
    call<PageEnvelope<ReportView>>({ method: 'GET', path: `${P}/reports`, query: { limit: 200, site_id: siteId }, signal }),

  createReport: (input: NewReport) => {
    const form = new FormData()
    form.set('site_id', input.site_id)
    form.set('description', input.description)
    form.set('category_user', input.category_user)
    if (input.photo) form.set('photo', input.photo, input.photo.type === 'image/png' ? 'photo.png' : 'photo.jpg')
    return call<Envelope<ReportView>>({ method: 'POST', path: `${P}/reports`, form })
  },

  /** PROPOSED endpoint (see api/proposed.ts). */
  reviewReport: (reportId: string, input: ReportReviewInput) =>
    call<Envelope<ReportView>>({ method: 'POST', path: `${P}/reports/${seg(reportId)}/review`, json: input }),

  events: (siteId?: string, signal?: AbortSignal) =>
    call<PageEnvelope<TimelineEvent>>({ method: 'GET', path: `${P}/events`, query: { limit: 100, site_id: siteId }, signal }),

  replay: (signal?: AbortSignal) => call<Envelope<Replay>>({ method: 'GET', path: `${P}/replay`, signal }),

  startReplay: (scenarioId = 'demo-storm') =>
    call<Envelope<Replay>>({ method: 'POST', path: `${P}/replay/start`, json: { scenario_id: scenarioId } }),

  stopReplay: () => call<Envelope<Replay>>({ method: 'POST', path: `${P}/replay/stop` }),

  /** PROPOSED endpoint (see api/proposed.ts). */
  replayScenarios: (signal?: AbortSignal) =>
    call<Envelope<ReplayScenario[]>>({ method: 'GET', path: `${P}/replay/scenarios`, signal }),

  /** Gemini narration takes about 20 s and the backend allows it 45 s, so this call gets 60 s instead of 8. */
  generateBriefing: () => call<Envelope<BriefingView>>({ method: 'POST', path: `${P}/briefings/generate`, timeoutMs: 60_000 }),

  briefings: (limit = 1, signal?: AbortSignal) =>
    call<PageEnvelope<BriefingView>>({ method: 'GET', path: `${P}/briefings`, query: { limit }, signal }),

  policies: (signal?: AbortSignal) => call<Envelope<Policy>>({ method: 'GET', path: `${P}/policies`, signal }),

  /** The sensor token is entered by the operator at reset time, never bundled. */
  /** With a sensor token, or none: then a logged-in supervisor's own Auth0 token is sent instead. */
  resetDemo: (token: string | null) =>
    call<Envelope<DemoResetResult>>({
      method: 'POST',
      path: `${P}/demo/reset`,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }),
}
