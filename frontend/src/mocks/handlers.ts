// Route table for the mock backend. Same paths, envelopes, pagination, status codes and error shape
// as the FastAPI app (backend/app/api/*), plus the PROPOSED endpoints from api/proposed.ts.
import type { ReplayScenario, ReportView } from '../api/proposed'
import type { ApiRequest, ApiResponse } from '../api/transport'
import type { CostInputs, DataMode, Health, Reading, ReportCategory, Vehicle } from '../api/types'
import { REPORT_CATEGORIES, VEHICLES } from '../api/types'
import { checkPhoto, readHead } from '../domain/upload'
import { db, iso, newId, notify } from './db'
import {
  DEMO_DEVICE_ID,
  DEMO_SITE_ID,
  POLICY,
  REPLAYS,
  SENSOR_TOKEN,
  allSiteStatuses,
  buildDisplay,
  evaluate,
  generateBriefing,
  portfolioMode,
  recordTimeline,
  resolveMatInputs,
  siteStatus,
} from './rules'
import type { ResolvedEvaluationInput } from './rules'
import { recordDeviceEvent } from './sensorSim'
import { coverage, pressureTendency } from './metrics'

interface Detail {
  field: string | null
  issue: string
}
interface Ctx {
  params: Record<string, string>
  query: URLSearchParams
  req: ApiRequest
  now: number
}
type Handler = (ctx: Ctx) => ApiResponse | Promise<ApiResponse>

const respond = (status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse => ({
  status,
  body,
  headers: { 'content-type': 'application/json', 'x-request-id': newId('mock'), ...headers },
})

function ok(data: unknown, mode: DataMode, meta: { sources?: string[]; missing_fields?: string[]; errors?: string[] } = {}, status = 200) {
  return respond(status, {
    data,
    mode,
    generated_at: iso(Date.now()),
    sources: meta.sources ?? [],
    missing_fields: meta.missing_fields ?? [],
    errors: meta.errors ?? [],
  })
}

function fail(status: number, code: string, message: string, details: Detail[] = [], headers: Record<string, string> = {}) {
  return respond(status, { error: { code, message, details, request_id: newId('mock') } }, headers)
}

const invalid = (details: Detail[]) => fail(422, 'VALIDATION_FAILED', 'Request validation failed.', details)

/** Backend `paged()`: newest-first lists sliced by limit/offset, with the same 1..500 limit check. */
function page(items: unknown[], query: URLSearchParams, mode: DataMode, meta: Parameters<typeof ok>[2] = {}) {
  const limit = Number(query.get('limit') ?? 50)
  const offset = Number(query.get('offset') ?? 0)
  const details: Detail[] = []
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) details.push({ field: 'limit', issue: 'Input should be between 1 and 500' })
  if (!Number.isInteger(offset) || offset < 0) details.push({ field: 'offset', issue: 'Input should be greater than or equal to 0' })
  if (details.length) return invalid(details)
  const res = ok(items.slice(offset, offset + limit), mode, meta)
  ;(res.body as Record<string, unknown>).pagination = { limit, offset, total: items.length }
  return res
}

const newestFirst = <T>(items: T[]) => [...items].reverse()

function requireToken(req: ApiRequest): ApiResponse | null {
  const auth = req.headers?.Authorization ?? req.headers?.authorization
  if (auth === `Bearer ${SENSOR_TOKEN}`) return null
  return fail(401, 'UNAUTHORIZED', 'Missing or invalid sensor token.', [], { 'www-authenticate': 'Bearer' })
}

function requireDevice(deviceId: string): ApiResponse | null {
  return deviceId === DEMO_DEVICE_ID
    ? null
    : fail(404, 'NOT_FOUND', `Device '${deviceId}' is not registered.`, [{ field: 'device_id', issue: 'unknown device' }])
}

const unknownSite = (siteId: string) => fail(404, 'NOT_FOUND', `Site '${siteId}' does not exist.`, [{ field: 'site_id', issue: 'unknown site' }])

// --- EvaluationIn validation (strict like Pydantic extra="forbid") ------------

// nullable: may be null or left out; blank mat inputs are then filled from the policy defaults.
const NUMBER_FIELDS: Record<string, { min?: number; gt?: number; max: number; int?: boolean; nullable?: boolean }> = {
  route_length: { gt: 0, max: 100_000 },
  route_width: { gt: 0, max: 1_000, nullable: true },
  mat_length: { gt: 0, max: 100, nullable: true },
  mat_width: { gt: 0, max: 100, nullable: true },
  layers: { min: 1, max: 3, int: true, nullable: true },
  margin_min: { min: 0, max: 1, nullable: true },
  margin_max: { min: 0, max: 1, nullable: true },
  mats_in_inventory: { min: 0, max: Number.MAX_SAFE_INTEGER, int: true },
  override_quantity: { min: 0, max: 100_000, int: true, nullable: true },
}
const COST_FIELDS = [
  'mats_rental',
  'delivery',
  'installation',
  'removal',
  'delay_not_prevented',
  'paid_idle_labor',
  'idle_equipment',
  'rescheduling',
  'extra_contract_cost',
]

function validateEvaluation(body: unknown): { value: ResolvedEvaluationInput } | { details: Detail[] } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { details: [{ field: null, issue: 'Input should be a valid dictionary' }] }
  const input = body as Record<string, unknown>
  const details: Detail[] = []
  const known = new Set(['vehicle', 'unit', 'costs', 'override_reason', ...Object.keys(NUMBER_FIELDS)])
  for (const key of Object.keys(input)) if (!known.has(key)) details.push({ field: key, issue: 'Extra inputs are not permitted' })
  if (!('route_length' in input)) details.push({ field: 'route_length', issue: 'Field required' })
  for (const [key, rule] of Object.entries(NUMBER_FIELDS)) {
    if (!(key in input) || (rule.nullable && input[key] === null)) continue
    const v = input[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || (rule.int && !Number.isInteger(v))) details.push({ field: key, issue: rule.int ? 'Input should be a valid integer' : 'Input should be a valid number' })
    else if ((rule.gt !== undefined && v <= rule.gt) || (rule.min !== undefined && v < rule.min) || v > rule.max) details.push({ field: key, issue: 'Input is out of range' })
  }
  if ('vehicle' in input && !VEHICLES.includes(input.vehicle as Vehicle)) details.push({ field: 'vehicle', issue: "Input should be 'pickup' or 'heavy_truck'" })
  if ('unit' in input && input.unit !== 'ft' && input.unit !== 'm') details.push({ field: 'unit', issue: "Input should be 'ft' or 'm'" })
  const costs = (input.costs ?? {}) as Record<string, unknown>
  if (typeof costs !== 'object' || costs === null) details.push({ field: 'costs', issue: 'Input should be a valid dictionary' })
  else {
    for (const [key, v] of Object.entries(costs)) {
      if (!COST_FIELDS.includes(key)) details.push({ field: `costs.${key}`, issue: 'Extra inputs are not permitted' })
      else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) details.push({ field: `costs.${key}`, issue: 'Input should be greater than or equal to 0' })
    }
  }
  const reason = input.override_reason ?? null
  if (reason !== null) {
    if (typeof reason !== 'string') details.push({ field: 'override_reason', issue: 'Input should be a valid string' })
    else if (reason.length < 3) details.push({ field: 'override_reason', issue: 'String should have at least 3 characters' })
    else if (reason.length > 200) details.push({ field: 'override_reason', issue: 'String should have at most 200 characters' })
  }
  const overrideQuantity = (input.override_quantity as number | null | undefined) ?? null
  if (!details.length && (overrideQuantity === null) !== (reason === null)) {
    details.push({ field: null, issue: 'Value error, override_quantity and override_reason must be given together' })
  }
  if (details.length) return { details }
  const blank = (key: string) => (input[key] as number | null | undefined) ?? null
  const resolved = resolveMatInputs({
    vehicle: (input.vehicle as Vehicle | undefined) ?? 'pickup',
    unit: (input.unit as 'ft' | 'm' | undefined) ?? 'ft',
    route_length: input.route_length as number,
    route_width: blank('route_width'),
    mat_length: blank('mat_length'),
    mat_width: blank('mat_width'),
    layers: blank('layers'),
    margin_min: blank('margin_min'),
    margin_max: blank('margin_max'),
    mats_in_inventory: (input.mats_in_inventory as number | undefined) ?? 0,
    override_quantity: overrideQuantity,
    override_reason: reason as string | null,
    costs: costs as CostInputs,
  })
  // Like the backend, margin order is checked after defaults are filled in (a 422 on margin_min).
  return 'value' in resolved ? resolved : { details: [resolved] }
}

// --- Crew reports ------------------------------------------------------------

const AI_SUGGESTION: Partial<Record<ReportCategory, ReportCategory>> = { other: 'standing_water' }
const AI_TAG_DELAY_MS = 3500

/** Simulates the advisory photo tagger finishing a few seconds after upload. */
export function tagPendingReports(): void {
  let changed = false
  for (const report of db.reports) {
    if (report.ai_status !== 'pending') continue
    report.category_ai = AI_SUGGESTION[report.category_user] ?? report.category_user
    report.ai_confidence = report.category_ai === report.category_user ? 0.82 : 0.61
    report.ai_status = 'done'
    changed = true
  }
  if (changed) notify()
}

async function createReport({ req, now }: Ctx): Promise<ApiResponse> {
  const form = req.form
  if (!form) return invalid([{ field: 'site_id', issue: 'Field required' }, { field: 'description', issue: 'Field required' }])
  const siteId = form.get('site_id')
  const description = form.get('description')
  const category = (form.get('category_user') ?? 'other') as ReportCategory
  const details: Detail[] = []
  if (typeof siteId !== 'string' || !siteId) details.push({ field: 'site_id', issue: 'Field required' })
  if (typeof description !== 'string' || !description) details.push({ field: 'description', issue: 'Field required' })
  else if (description.length > 500) details.push({ field: 'description', issue: 'String should have at most 500 characters' })
  if (!REPORT_CATEGORIES.includes(category)) details.push({ field: 'category_user', issue: 'Input should be a known category' })
  if (details.length) return invalid(details)
  if (!siteStatus(siteId as string, now)) return unknownSite(siteId as string)
  const text = (description as string).trim()
  if (!text) return invalid([{ field: 'description', issue: 'must not be blank' }])

  let imageUrl: string | null = null
  const photo = form.get('photo')
  if (photo instanceof Blob && photo.size > 0) {
    const check = checkPhoto(await readHead(photo), photo.size)
    if (!check.ok) {
      return photo.size > 5 * 1024 * 1024
        ? fail(413, 'PAYLOAD_TOO_LARGE', 'Photo exceeds the 5 MB limit.', [{ field: 'photo', issue: 'too large' }])
        : fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Photo must be a JPEG or PNG.', [{ field: 'photo', issue: 'unsupported format' }])
    }
    imageUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(photo) : null
  }

  const report: ReportView = {
    id: newId('report'),
    site_id: siteId as string,
    description: text,
    category_user: category,
    category_ai: null,
    ai_confidence: null,
    image_url: imageUrl,
    reported_at: iso(now),
    verification: 'unreviewed',
    ai_status: imageUrl && db.aiTaggerOnline ? 'pending' : 'unavailable',
  }
  db.reports.push(report)
  recordTimeline('hazard_report', `Crew report (${category}): ${text.slice(0, 80)}`, now, report.site_id, report.id)
  if (report.ai_status === 'pending') setTimeout(tagPendingReports, AI_TAG_DELAY_MS)
  notify()
  return ok(report, 'live', {}, 201)
}

// --- Routes -------------------------------------------------------------------

const SCENARIO_TITLES: Record<string, string> = {
  'demo-storm': 'Hurricane Milton · Oct 9 2024',
  'calm-day': 'Calm summer day · Jul 15 2024',
}

/** The backend's replay fixtures, copied by scripts/build-mock-replays.mjs. */
const SCENARIOS: ReplayScenario[] = Object.entries(REPLAYS).map(([id, r]) => ({
  id,
  title: SCENARIO_TITLES[id] ?? r.label,
  event: r.alert ?? 'No alert assumed',
  source: r.source,
  reference_url: null,
  onset: null,
  expires: null,
  area: 'All field sites',
}))

const routes: [ApiRequest['method'], string, Handler][] = [
  ['GET', '/api/v1/health', () => {
    const data: Health = {
      status: 'ok',
      version: '0.2.0-mock',
      storage: 'in-browser mock (resets on reload)',
      // Like the backend with GROUNDWORK_AUTH_ENABLED off: every caller is a demo user with both roles.
      auth: 'disabled',
      sites_loaded: allSiteStatuses(Date.now()).length,
      replay_active: db.demo.replayActive,
      fixtures: { 'sites_50.json': true, 'weather_snapshot.json': true, 'storm_replay.json': false, 'sensor_replay.csv': false, 'display_states.json': false },
      connectors: { open_meteo: 'ok', usda_nrcs: 'not_built', nws: 'not_built' },
    }
    return ok(data, db.demo.replayActive ? 'replay' : 'live')
  }],

  ['GET', '/api/v1/sites', ({ query, now }) => {
    const weather = query.get('weather_state')
    const statuses = allSiteStatuses(now).filter((s) => !weather || s.weather_state === weather)
    const missing = [...new Set(statuses.flatMap((s) => s.missing_fields))].sort()
    return page(statuses, query, portfolioMode(), { missing_fields: missing, sources: ['Open-Meteo'] })
  }],

  ['GET', '/api/v1/sites/:id', ({ params, now }) => {
    const status = siteStatus(params.id, now)
    if (!status) return unknownSite(params.id)
    const reports = newestFirst(db.reports.filter((r) => r.site_id === params.id))
    return ok({ ...status, reports }, status.mode ?? 'cached', { missing_fields: status.missing_fields })
  }],

  ['POST', '/api/v1/sites/:id/evaluate', ({ params, req, now }) => {
    const parsed = validateEvaluation(req.json)
    if ('details' in parsed) return invalid(parsed.details)
    const status = siteStatus(params.id, now)
    if (!status) return unknownSite(params.id)
    return ok(evaluate(status, parsed.value), status.mode ?? 'cached', { missing_fields: status.missing_fields })
  }],

  ['POST', '/api/v1/sensors/readings', ({ req, now }) => {
    const denied = requireToken(req)
    if (denied) return denied
    const body = req.json as Partial<Reading>
    const reading = { ...body, received_at: iso(now) } as Reading
    db.readings.push(reading)
    notify()
    return ok(reading, reading.mode, {}, 201)
  }],

  ['GET', '/api/v1/sensors/:device/latest', ({ params }) => {
    const missing = requireDevice(params.device)
    if (missing) return missing
    const latest = db.readings.at(-1)
    if (!latest) return fail(404, 'NOT_FOUND', `Device '${params.device}' has not sent any readings yet.`)
    return ok(latest, latest.mode)
  }],

  ['GET', '/api/v1/sensors/:device/history', ({ params, query }) => {
    const missing = requireDevice(params.device)
    if (missing) return missing
    const rows = newestFirst(db.readings)
    return page(rows, query, rows[0]?.mode ?? 'sensor_demo')
  }],

  ['GET', '/api/v1/sensors/:device/pressure-tendency', ({ params, now }) => requireDevice(params.device) ?? ok(pressureTendency(params.device, now), 'sensor_demo')],

  ['GET', '/api/v1/devices/:device/display', ({ params, now }) => requireDevice(params.device) ?? respond(200, buildDisplay(now))],

  ['GET', '/api/v1/devices/:device/events', ({ params, query }) => requireDevice(params.device) ?? page(newestFirst(db.deviceEvents), query, 'sensor_demo')],

  ['DELETE', '/api/v1/devices/:device/crew-flag', ({ params, now }) => {
    const missing = requireDevice(params.device)
    if (missing) return missing
    if (db.demo.crewFlagAt !== null) {
      db.demo.crewFlagAt = null
      recordTimeline('crew_flag_cleared', `Crew flag cleared on ${params.device}`, now, DEMO_SITE_ID)
      notify()
    }
    const display = buildDisplay(now)
    return ok(display, display.mode)
  }],

  ['POST', '/api/v1/devices/:device/events', ({ params, req, now }) => {
    const denied = requireToken(req) ?? requireDevice(params.device)
    if (denied) return denied
    const event = (req.json as { event?: string } | undefined)?.event
    if (event !== 'ack_touch' && event !== 'crew_flag') return invalid([{ field: 'event', issue: "Input should be 'ack_touch' or 'crew_flag'" }])
    const record = recordDeviceEvent(event, now)
    return ok(record, record.mode, {}, 201)
  }],

  ['GET', '/api/v1/reports', ({ query }) => {
    const siteId = query.get('site_id')
    return page(newestFirst(db.reports.filter((r) => !siteId || r.site_id === siteId)), query, 'live')
  }],

  ['POST', '/api/v1/reports', createReport],

  ['GET', '/api/v1/reports/:id', ({ params }) => {
    const report = db.reports.find((r) => r.id === params.id)
    return report ? ok(report, 'live') : fail(404, 'NOT_FOUND', `Report '${params.id}' does not exist.`)
  }],

  // PROPOSED: confirm or correct the advisory AI tag.
  ['POST', '/api/v1/reports/:id/review', ({ params, req }) => {
    const report = db.reports.find((r) => r.id === params.id)
    if (!report) return fail(404, 'NOT_FOUND', `Report '${params.id}' does not exist.`)
    const body = (req.json ?? {}) as { category_user?: ReportCategory; verification?: string }
    if (body.verification !== 'confirmed' && body.verification !== 'rejected') return invalid([{ field: 'verification', issue: "Input should be 'confirmed' or 'rejected'" }])
    if (body.category_user && !REPORT_CATEGORIES.includes(body.category_user)) return invalid([{ field: 'category_user', issue: 'Input should be a known category' }])
    if (body.category_user) report.category_user = body.category_user
    report.verification = body.verification
    notify()
    return ok(report, 'live')
  }],

  ['GET', '/api/v1/events', ({ query }) => {
    const siteId = query.get('site_id')
    // Site-less events (replay start/stop) apply to every site, so they're included.
    const rows = newestFirst(db.timeline.filter((t) => !siteId || t.site_id === siteId || t.site_id === null))
    return page(rows, query, db.demo.replayActive ? 'replay' : 'live')
  }],

  ['GET', '/api/v1/replay', () => replayResponse()],

  ['GET', '/api/v1/replay/scenarios', () => ok(SCENARIOS, 'simulated')],

  ['POST', '/api/v1/replay/start', ({ req, now }) => {
    const scenarioId = (req.json as { scenario_id?: string } | undefined)?.scenario_id ?? 'demo-storm'
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(scenarioId)) return invalid([{ field: 'scenario_id', issue: 'String should match pattern' }])
    const d = db.demo
    if (!(d.replayActive && d.replayScenarioId === scenarioId)) {
      Object.assign(d, {
        replayActive: true,
        replayScenarioId: scenarioId,
        replaySource: SCENARIOS.find((s) => s.id === scenarioId)?.source ?? null,
        replayStartedAt: iso(now),
        acknowledgedAt: null, // a new STOP_WORK re-arms the beacon alarm
      })
      recordTimeline('replay_started', `Storm replay '${scenarioId}' started`, now, null, scenarioId)
      notify()
    }
    return replayResponse()
  }],

  ['POST', '/api/v1/replay/stop', ({ now }) => {
    if (db.demo.replayActive) {
      Object.assign(db.demo, { replayActive: false, replayScenarioId: null, replaySource: null, replayStartedAt: null, acknowledgedAt: null })
      recordTimeline('replay_stopped', 'Storm replay stopped; live/cached state restored', now)
      notify()
    }
    return replayResponse()
  }],

  ['POST', '/api/v1/briefings/generate', ({ now }) => {
    const brief = generateBriefing(now)
    notify()
    return ok(brief, brief.mode, {}, 201)
  }],

  ['GET', '/api/v1/briefings', ({ query }) => page(newestFirst(db.briefings), query, 'simulated')],

  ['GET', '/api/v1/briefings/:id', ({ params }) => {
    const brief = db.briefings.find((b) => b.id === params.id)
    return brief ? ok(brief, brief.mode) : fail(404, 'NOT_FOUND', `Briefing '${params.id}' does not exist.`)
  }],

  ['GET', '/api/v1/policies', () => ok(POLICY, 'simulated')],

  ['GET', '/api/v1/coverage', ({ now }) => ok(coverage(now), 'simulated')],

  // The learned forecast is trained offline (backend/ml); the in-browser mock has no model, as the backend
  // answers before training. Sites in mock mode carry no forecast_model.
  ['GET', '/api/v1/forecast-model', () => fail(404, 'NOT_FOUND', 'No trained model in the in-browser mock. Use live mode.')],

  // Between judge groups (README §14.3). Needs the sensor token, like the backend's.
  ['POST', '/api/v1/demo/reset', ({ req, now }) => {
    const denied = requireToken(req)
    if (denied) return denied
    const result = { replay_stopped: db.demo.replayActive, reports_cleared: db.reports.length, device_events_cleared: db.deviceEvents.length }
    if (db.demo.replayActive) recordTimeline('replay_stopped', 'Demo reset: storm replay ended', now)
    Object.assign(db.demo, {
      replayActive: false,
      replayScenarioId: null,
      replaySource: null,
      replayStartedAt: null,
      acknowledgedAt: null,
      crewFlagAt: null,
      demoVehicle: 'heavy_truck',
    })
    db.reports = []
    db.deviceEvents = []
    notify()
    return ok(result, 'sensor_demo')
  }],
]

function replayResponse() {
  const d = db.demo
  const data = { active: d.replayActive, scenario_id: d.replayScenarioId, source: d.replaySource, started_at: d.replayStartedAt }
  const warnings = d.replayActive && !d.replaySource ? ['fixtures/storm_replay.json not added yet; replay has no real event source attached'] : []
  return ok(data, d.replayActive ? 'replay' : 'simulated', { errors: warnings })
}

const compiled = routes.map(([method, pattern, handler]) => {
  const names: string[] = []
  const regex = new RegExp(
    `^${pattern.replace(/:(\w+)/g, (_, name: string) => {
      names.push(name)
      return '([^/]+)'
    })}$`,
  )
  return { method, regex, names, handler }
})

/** Dispatches one request with no latency or fault injection (the transport adds those). */
export async function handle(req: ApiRequest, now = Date.now()): Promise<ApiResponse> {
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined && v !== null) query.set(k, String(v))
  let pathMatched = false
  for (const route of compiled) {
    const m = route.regex.exec(req.path)
    if (!m) continue
    pathMatched = true
    if (route.method !== req.method) continue
    const params = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(m[i + 1])]))
    return route.handler({ params, query, req, now })
  }
  return pathMatched ? fail(405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed') : fail(404, 'NOT_FOUND', 'Not Found')
}
