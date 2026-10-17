// Friendly names for the generated contract (schema.gen.ts comes from backend/openapi.json).
import type { components } from './schema.gen'

type S = components['schemas']

export type Site = S['SiteOut']
export type SiteDetail = S['SiteDetailOut']
export type Observation = S['ObservationOut']
export type Evaluation = S['EvaluationOut']
export type EvaluationInput = S['EvaluationIn']
export type CostInputs = S['CostInputs']
export type MatsEstimate = S['MatsEstimateOut']
export type CostComparison = S['CostComparisonOut']
export type Reading = S['ReadingOut']
export type Display = S['DisplayOut']
export type DeviceEvent = S['DeviceEventOut']
export type Report = S['ReportOut']
export type Replay = S['ReplayOut']
export type Briefing = S['BriefingOut']
export type PrioritySite = S['PrioritySiteOut']
export type MissingDataNote = S['MissingDataNoteOut']
export type TimelineEvent = S['TimelineEventOut']
export type Policy = S['PolicyOut']
export type Health = S['HealthOut']
export type Pagination = S['Pagination']
export type ApiErrorBody = S['ErrorResponse']
export type DemoResetResult = S['DemoResetOut']
export type Coverage = S['CoverageOut']
export type PressureTendency = S['PressureTendencyOut']

export type WeatherState = Site['weather_state']
export type AccessCall = S['VehicleAccessOut']['pickup']
export type EffectiveStatus = S['VehicleStatusOut']['pickup']
export type Vehicle = Evaluation['vehicle']
export type DataMode = S['Envelope_SiteDetailOut_']['mode']
export type DataStatus = Site['data_status']
export type ObservationKind = Observation['kind']
export type ObservationQuality = Observation['quality']
export type ReportCategory = Report['category_user']
export type Verification = Report['verification']
export type DisplayCode = Display['code']
export type TimelineKind = TimelineEvent['kind']

/** Every response except /devices/{id}/display: {data, mode, generated_at, sources, missing_fields, errors}. */
export interface Envelope<T> {
  data: T
  mode: DataMode
  generated_at: string
  sources?: string[]
  missing_fields?: string[]
  /** Non-fatal data-quality notes, e.g. "replay has no real event source attached". */
  errors?: string[]
}

export interface PageEnvelope<T> extends Envelope<T[]> {
  pagination: Pagination
}

// Runtime lists of the enums, checked against the generated types at compile time:
// if the backend adds a value, `tsc` fails here instead of the UI silently mis-rendering it.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export const EFFECTIVE_STATUSES = [
  'GO_FOR_REVIEW',
  'MATS_FOR_REVIEW',
  'SUPERVISOR_REVIEW',
  'NO_GO_FOR_REVIEW',
  'STOP_WORK',
  'UNKNOWN',
] as const
export const effectiveStatusesComplete: Same<EffectiveStatus, (typeof EFFECTIVE_STATUSES)[number]> = true

export const WEATHER_STATES = ['NORMAL', 'CAUTION', 'STOP_WORK', 'UNKNOWN'] as const
export const weatherStatesComplete: Same<WeatherState, (typeof WEATHER_STATES)[number]> = true

export const ACCESS_CALLS = ['GO_FOR_REVIEW', 'MATS_FOR_REVIEW', 'NO_GO_FOR_REVIEW', 'UNKNOWN'] as const
export const accessCallsComplete: Same<AccessCall, (typeof ACCESS_CALLS)[number]> = true

export const DISPLAY_CODES = ['GO', 'MATS', 'REVIEW', 'NOGO', 'STOP', 'UNKNOWN'] as const
export const displayCodesComplete: Same<DisplayCode, (typeof DISPLAY_CODES)[number]> = true

export const DATA_MODES = ['live', 'cached', 'replay', 'simulated', 'sensor_demo', 'sensor_replay'] as const
export const dataModesComplete: Same<DataMode, (typeof DATA_MODES)[number]> = true

export const VEHICLES = ['pickup', 'heavy_truck'] as const
export const vehiclesComplete: Same<Vehicle, (typeof VEHICLES)[number]> = true

export const REPORT_CATEGORIES = [
  'standing_water',
  'mud',
  'flooded_road',
  'fallen_tree',
  'overhead_hazard',
  'lightning_observed',
  'heat',
  'other',
] as const
export const reportCategoriesComplete: Same<ReportCategory, (typeof REPORT_CATEGORIES)[number]> = true

export const OBSERVATION_QUALITIES = ['available', 'stale', 'missing', 'simulated', 'sensor_demo', 'sensor_replay'] as const
export const observationQualitiesComplete: Same<ObservationQuality, (typeof OBSERVATION_QUALITIES)[number]> = true
