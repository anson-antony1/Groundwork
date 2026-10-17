// Mock-backend rules, copied from backend/app/services (site_status, display, access, mats, cost,
// briefings) so mock mode behaves like the real API. This is a stand-in for the backend: UI code never
// imports it, and the UI never computes any of these values itself.
import type { BriefingView, DisplayView, SiteView } from '../api/proposed'
import type {
  AccessCall,
  CostInputs,
  DataMode,
  EffectiveStatus,
  Evaluation,
  Observation,
  Policy,
  Reading,
  TimelineEvent,
  Vehicle,
  WeatherState,
} from '../api/types'
import { rankSites } from '../domain/ranking'
import fixture from './data/sites.json'
import { db, iso, newId } from './db'

export const DEMO_SITE_ID = 'DEMO-TRAY'
export const DEMO_DEVICE_ID = 'tray-01'
export const SENSOR_TOKEN = 'dev-sensor-token'
const SENSOR_STALE_SECONDS = 15

export const POLICY: Policy = {
  label: 'DEMO POLICY - not regulatory limits or certified engineering values',
  demo_tray_access: {
    basis: 'sensor-calibrated 0-100 moisture index on the demo tray only',
    pickup: { go_below: 60, mats_below: 80 },
    heavy_truck: { go_below: 40, mats_below: 65 },
  },
  hazard_weights: { rain: 0.25, wind: 0.15, heat: 0.2, flood: 0.2, storm: 0.2 },
  sensor_stale_seconds: SENSOR_STALE_SECONDS,
  // policies/mats_defaults.json (a contract test keeps this copy in step with the file).
  mat_defaults: {
    label: "DEMO DEFAULTS - editable starting values, not engineering ratings. Replace mat size with your vendor's effective coverage.",
    unit: 'ft',
    route_width: 12,
    mat_length: 14,
    mat_width: 8,
    layers: { pickup: 1, heavy_truck: 1 },
    margin_min: 0.1,
    margin_max: 0.25,
  },
}

interface MockSite {
  id: string
  name: string
  latitude: number
  longitude: number
  region: string | null
  location_origin: string
  observations: Observation[]
  scenario: {
    weather_state: WeatherState
    hazard_score: number | null
    hazard_subscores: SiteView['hazard_subscores'] | null
    access: Record<Vehicle, AccessCall>
    missing_fields: string[]
    stale: boolean
    alert_events: string[]
    hazard_explanation: string[]
  }
}

export const FIELD_SITES = (fixture as unknown as { sites: MockSite[] }).sites

const DEMO_SITE = {
  id: DEMO_SITE_ID,
  name: 'Demo tray (beacon)',
  latitude: 29.6465,
  longitude: -82.348,
  region: 'Demo venue',
  location_origin: 'demo tray at the venue (approximate)',
}

const VEHICLES: Vehicle[] = ['pickup', 'heavy_truck']

export function demoTrayAccess(moisture: number | null, vehicle: Vehicle): AccessCall {
  if (moisture === null) return 'UNKNOWN'
  const limits = POLICY.demo_tray_access[vehicle]
  if (moisture < limits.go_below) return 'GO_FOR_REVIEW'
  if (moisture < limits.mats_below) return 'MATS_FOR_REVIEW'
  return 'NO_GO_FOR_REVIEW'
}

export function latestReading(): Reading | null {
  return db.readings.at(-1) ?? null
}

/** A reading older than SENSOR_STALE_SECONDS (by receive time) doesn't count. */
export function freshReading(now: number): Reading | null {
  const latest = latestReading()
  if (!latest || now - Date.parse(latest.received_at) > SENSOR_STALE_SECONDS * 1000) return null
  return latest
}

export function portfolioMode(): DataMode {
  return db.demo.replayActive ? 'replay' : 'cached'
}

function effective(weather: WeatherState, access: Record<Vehicle, AccessCall>, crewFlag: boolean) {
  const out = {} as Record<Vehicle, EffectiveStatus>
  for (const v of VEHICLES) {
    if (weather === 'STOP_WORK' || weather === 'UNKNOWN') out[v] = weather
    else if (crewFlag) out[v] = 'SUPERVISOR_REVIEW'
    else out[v] = access[v]
  }
  return out
}

/** Like the backend's Milton replay: a simulated warning, and every field site at the scale maximum. */
const REPLAY_ALERT = 'Hurricane Warning (SIMULATED, mock replay)'
const REPLAY_SCORE = 7

function fieldSiteStatus(site: MockSite, now: number): SiteView {
  const replay = db.demo.replayActive
  const weather_state: WeatherState = replay ? 'STOP_WORK' : site.scenario.weather_state
  const missing = [...site.scenario.missing_fields, ...site.observations.filter((o) => o.value === null).map((o) => o.variable)]
  return {
    id: site.id,
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    region: site.region,
    location_origin: site.location_origin,
    hazard_score: replay ? REPLAY_SCORE : site.scenario.hazard_score,
    weather_state,
    access_call: site.scenario.access,
    effective_status: effective(weather_state, site.scenario.access, false),
    data_status: site.scenario.stale ? 'stale' : site.observations.length ? 'available' : 'not_fetched',
    observations: site.observations,
    missing_fields: missing,
    evaluated_at: iso(now),
    mode: replay ? 'replay' : 'cached',
    hazard_subscores: site.scenario.hazard_subscores ?? undefined,
    alert_events: replay ? [REPLAY_ALERT] : site.scenario.alert_events,
    hazard_explanation: replay
      ? [`Historical storm replay: hazard ${REPLAY_SCORE}.0 (scale maximum)`, `Active alert: ${REPLAY_ALERT} forces STOP WORK`]
      : site.scenario.hazard_explanation,
  }
}

function demoSiteStatus(now: number): SiteView {
  const replay = db.demo.replayActive
  // The tray has no live weather feed; it runs a calm-weather demo scenario.
  const weather_state: WeatherState = replay ? 'STOP_WORK' : 'NORMAL'
  const reading = freshReading(now)
  const moisture = reading?.moisture_index ?? null
  const access = { pickup: demoTrayAccess(moisture, 'pickup'), heavy_truck: demoTrayAccess(moisture, 'heavy_truck') }
  return {
    ...DEMO_SITE,
    hazard_score: null,
    weather_state,
    access_call: access,
    effective_status: effective(weather_state, access, db.demo.crewFlagAt !== null),
    data_status: 'sensor_demo',
    observations: [],
    missing_fields: reading ? [] : ['demo_tray_moisture'],
    evaluated_at: iso(now),
    mode: replay ? 'replay' : 'sensor_demo',
    alert_events: replay ? [REPLAY_ALERT] : [],
    hazard_explanation: [],
  }
}

export function siteStatus(siteId: string, now: number): SiteView | null {
  if (siteId === DEMO_SITE_ID) return demoSiteStatus(now)
  const site = FIELD_SITES.find((s) => s.id === siteId)
  return site ? fieldSiteStatus(site, now) : null
}

export function allSiteStatuses(now: number): SiteView[] {
  return [demoSiteStatus(now), ...FIELD_SITES.map((s) => fieldSiteStatus(s, now))]
}

// --- Beacon display (backend services/display.py) ---------------------------

const STATUS_DISPLAY: Record<EffectiveStatus, [DisplayView['code'], string]> = {
  GO_FOR_REVIEW: ['GO', 'GO FOR REVIEW'],
  MATS_FOR_REVIEW: ['MATS', 'MATS FOR REVIEW'],
  SUPERVISOR_REVIEW: ['REVIEW', 'SUPV REVIEW'],
  NO_GO_FOR_REVIEW: ['NOGO', 'NO GO - REVIEW'],
  STOP_WORK: ['STOP', 'STOP WORK - ACK?'],
  UNKNOWN: ['UNKNOWN', 'NO SENSOR DATA'],
}

const lcd = (text: string) => text.replace(/[^\x20-\x7e]|\|/g, '').slice(0, 16)

/** Precedence: STOP_WORK > crew flag > ground access. */
export function demoStatus(now: number): [EffectiveStatus, DataMode] {
  if (db.demo.replayActive) return ['STOP_WORK', 'replay']
  const reading = freshReading(now)
  const mode: DataMode = reading?.mode ?? 'sensor_demo'
  if (db.demo.crewFlagAt !== null) return ['SUPERVISOR_REVIEW', mode]
  if (!reading) return ['UNKNOWN', mode]
  return [demoTrayAccess(reading.moisture_index, db.demo.demoVehicle), mode]
}

export function buildDisplay(now: number): DisplayView {
  const [status, mode] = demoStatus(now)
  const [code, line2] = STATUS_DISPLAY[status]
  const acked = status === 'STOP_WORK' && db.demo.acknowledgedAt !== null
  return {
    device_id: DEMO_DEVICE_ID,
    site_id: DEMO_SITE_ID,
    effective_status: status,
    code,
    lcd_line1: lcd(`DEMO TRAY   ${db.demo.demoVehicle === 'pickup' ? 'PKP' : 'HVY'}`),
    lcd_line2: lcd(acked ? 'STOP WORK - ACKD' : line2),
    alarm: status === 'STOP_WORK' && !acked,
    acknowledged_at: acked ? db.demo.acknowledgedAt : null,
    mode,
    generated_at: iso(now),
    vehicle: db.demo.demoVehicle,
  }
}

// --- Timeline -----------------------------------------------------------------

export function recordTimeline(kind: TimelineEvent['kind'], summary: string, now: number, siteId: string | null = null, refId: string | null = null) {
  db.timeline.push({ id: newId('tl'), kind, site_id: siteId, summary, ref_id: refId, at: iso(now) })
}

// --- Mats and costs (backend services/mats.py, cost.py) ---------------------

const MATS_METHOD = 'base = ceil(L*W / (Ml*Mw)); planned = ceil(base * layers * (1 + margin))'
const MATS_CAVEAT =
  'Early logistics estimate using a simple area method. Ignores route bends, geotechnical engineering, mat overlap geometry and mat load capacity. Not a design calculation.'
const COST_LABEL = 'Illustrative estimate - edit assumptions. Not guaranteed savings.'

// Round first so float noise (40 * 1.1 = 44.000000000000004) doesn't add a phantom mat.
const ceil6 = (x: number) => Math.ceil(Math.round(x * 1e6) / 1e6)
const round2 = (x: number) => Math.round(x * 100) / 100

const ZERO_COSTS: Required<CostInputs> = {
  mats_rental: 0,
  delivery: 0,
  installation: 0,
  removal: 0,
  delay_not_prevented: 0,
  paid_idle_labor: 0,
  idle_equipment: 0,
  rescheduling: 0,
  extra_contract_cost: 0,
  idle_hours: 0,
  labor_rate_per_hour: 0,
  equipment_rate_per_hour: 0,
}

const FT_PER_M = 3.28084
// Mat inputs a request may leave blank; they're filled from POLICY.mat_defaults (backend DEFAULTABLE).
const DEFAULTABLE = ['route_width', 'mat_length', 'mat_width', 'layers', 'margin_min', 'margin_max'] as const
type Defaultable = (typeof DEFAULTABLE)[number]

/** A validated EvaluationIn with every mat input resolved (backend services/mats.py resolve_inputs). */
export interface ResolvedEvaluationInput {
  vehicle: Vehicle
  unit: 'ft' | 'm'
  route_length: number
  route_width: number
  mat_length: number
  mat_width: number
  layers: number
  margin_min: number
  margin_max: number
  mats_in_inventory: number
  override_quantity: number | null
  override_reason: string | null
  costs: CostInputs
  defaults_applied: Defaultable[]
}

export type ValidatedEvaluationInput = Omit<ResolvedEvaluationInput, Defaultable | 'defaults_applied'> & Record<Defaultable, number | null>

/** Fills blank inputs from the policy defaults (converted to the request's unit), then checks margin order. */
export function resolveMatInputs(input: ValidatedEvaluationInput): { value: ResolvedEvaluationInput } | { field: string; issue: string } {
  const d = POLICY.mat_defaults
  const scale = input.unit === 'm' && d.unit === 'ft' ? 1 / FT_PER_M : 1
  const defaults: Record<Defaultable, number> = {
    route_width: round2(d.route_width * scale),
    mat_length: round2(d.mat_length * scale),
    mat_width: round2(d.mat_width * scale),
    layers: d.layers[input.vehicle] ?? 1,
    margin_min: d.margin_min,
    margin_max: d.margin_max,
  }
  const applied = DEFAULTABLE.filter((k) => input[k] === null)
  const value = { ...input, ...Object.fromEntries(applied.map((k) => [k, defaults[k]])), defaults_applied: applied } as ResolvedEvaluationInput
  if (value.margin_min > value.margin_max) return { field: 'margin_min', issue: `must be <= margin_max (${value.margin_max})` }
  return { value }
}

// Python's _n: whole numbers with thousands separators, otherwise up to 2 decimals without trailing zeros.
const stepNum = (x: number) =>
  Number.isInteger(x)
    ? x.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/0+$/, '').replace(/\.$/, '')

export function evaluate(site: SiteView, input: ResolvedEvaluationInput): Evaluation {
  const u = input.unit
  const routeArea = input.route_length * input.route_width
  const matArea = input.mat_length * input.mat_width
  const base = ceil6(routeArea / matArea)
  const low = ceil6(base * input.layers * (1 + input.margin_min))
  const high = ceil6(base * input.layers * (1 + input.margin_max))
  const planned = input.override_quantity ?? high
  const shortfall = Math.max(0, planned - input.mats_in_inventory)
  const steps = [
    `Route area: ${stepNum(input.route_length)} ${u} x ${stepNum(input.route_width)} ${u} = ${stepNum(routeArea)} ${u}2`,
    `Mat coverage: ${stepNum(input.mat_length)} ${u} x ${stepNum(input.mat_width)} ${u} = ${stepNum(matArea)} ${u}2 per mat`,
    `Base mats: ceil(${stepNum(routeArea)} / ${stepNum(matArea)}) = ${base}`,
    `Low estimate: ceil(${base} x ${input.layers} layer(s) x ${stepNum(1 + input.margin_min)}) = ${low}`,
    `High estimate: ceil(${base} x ${input.layers} layer(s) x ${stepNum(1 + input.margin_max)}) = ${high}`,
    ...(input.override_quantity !== null ? [`Supervisor override: ${planned} mats (reason: ${input.override_reason})`] : []),
    `Shortfall: max(0, ${planned} planned - ${input.mats_in_inventory} in stock) = ${shortfall}`,
  ]
  const c: Required<CostInputs> = { ...ZERO_COSTS, ...input.costs }
  const matsOption = c.mats_rental + c.delivery + c.installation + c.removal + c.delay_not_prevented
  const postpone = c.paid_idle_labor + c.idle_equipment + c.rescheduling + c.extra_contract_cost + c.idle_hours * (c.labor_rate_per_hour + c.equipment_rate_per_hour)
  const stop = site.weather_state === 'STOP_WORK'
  return {
    site_id: site.id,
    vehicle: input.vehicle,
    weather_state: site.weather_state,
    access_call: site.access_call[input.vehicle],
    effective_status: site.effective_status[input.vehicle],
    mats_estimate: {
      inputs: {
        route_length: input.route_length,
        route_width: input.route_width,
        mat_length: input.mat_length,
        mat_width: input.mat_width,
        layers: input.layers,
        margin_min: input.margin_min,
        margin_max: input.margin_max,
      },
      defaults_applied: input.defaults_applied,
      base_mats: base,
      min_estimate: low,
      max_estimate: high,
      planned_quantity: planned,
      override: input.override_quantity !== null ? { quantity: input.override_quantity, reason: input.override_reason ?? '' } : null,
      mats_in_inventory: input.mats_in_inventory,
      shortfall,
      unit: u,
      steps,
      method: MATS_METHOD,
      caveat: MATS_CAVEAT,
    },
    // Mats never make lightning/flood/severe weather safe (README §6).
    mats_recommended: !stop && site.access_call[input.vehicle] === 'MATS_FOR_REVIEW',
    cost_comparison: {
      mats_option: round2(matsOption),
      postpone_option: round2(postpone),
      modeled_difference: round2(postpone - matsOption),
      assumptions: c,
      label: COST_LABEL,
    },
    notes: stop ? ['STOP WORK active: cost comparison is a planning scenario only, not a recommendation.'] : [],
  }
}

// --- 6 PM briefing (backend services/briefings.py, deterministic template) ---

export function generateBriefing(now: number): BriefingView {
  const statuses = rankSites(allSiteStatuses(now))
  const stop = statuses.filter((s) => s.weather_state === 'STOP_WORK').map((s) => s.id)
  const unknown = statuses.filter((s) => s.weather_state === 'UNKNOWN')
  const unreviewed = db.reports.filter((r) => r.verification === 'unreviewed')
  const summary =
    `${statuses.length} sites evaluated. ${stop.length} under STOP WORK. ` +
    `${unknown.length} have missing weather data and must not be treated as safe. ` +
    `${unreviewed.length} crew reports await review.`
  const brief: BriefingView = {
    id: newId('brief'),
    generated_at: iso(now),
    mode: portfolioMode(),
    summary,
    top_priority_sites: statuses.slice(0, 10).map((s) => ({
      id: s.id,
      name: s.name,
      weather_state: s.weather_state,
      hazard_score: s.hazard_score ?? null,
      effective_status: s.effective_status,
    })),
    stop_work_site_ids: stop,
    missing_data_notes: statuses.filter((s) => s.missing_fields.length).map((s) => ({ site_id: s.id, missing_fields: s.missing_fields })),
    crew_report_followups: unreviewed,
    narrative_source: 'deterministic_template',
    deterministic_summary: summary,
    sources: ['Open-Meteo (cached snapshot)', 'Demo tray sensor', 'Crew reports'],
  }
  db.briefings.push(brief)
  recordTimeline('briefing_generated', summary, now, null, brief.id)
  return brief
}
