// PROPOSED contract extensions: fields and endpoints the UI needs that backend v0.2.0 doesn't serve yet.
// Each is an open question for Aashita (see frontend/README.md). Everything here is optional:
// screens render these when present and say "Missing" / "Not provided yet" when absent; they never invent values.
import type { Briefing, DataMode, Display, Report, ReportCategory, Site, SiteDetail, Vehicle } from './types'

/** 0–10 weather sub-scores behind hazard_score (README §3). */
export interface HazardSubscores {
  rain: number | null
  wind: number | null
  heat: number | null
  flood: number | null
  storm: number | null
}

/** An official alert (e.g. an NWS warning) that applies to a site. */
export interface WeatherAlert {
  event: string
  source: string
  severity?: string | null
  onset?: string | null
  expires?: string | null
  reference_url?: string | null
}

/** Inputs for the "Why this call?" panel. */
export interface CallReasons {
  weather_triggers?: string[]
  soil_drainage?: string | null
  vehicle_class?: string | null
}

export interface SiteExtras {
  /** Per-site data mode, so each marker can show LIVE / CACHED / REPLAY / SIMULATED / SENSOR DEMO. */
  mode?: DataMode
  /** Server-side priority order shared with the 6 PM briefing. */
  priority_rank?: number
  hazard_subscores?: HazardSubscores
  alerts?: WeatherAlert[]
  reasons?: CallReasons
}

export type SiteView = Site & SiteExtras
export type SiteDetailView = SiteDetail & SiteExtras

export interface ReportExtras {
  /** Tells "tagging still running" apart from "tagger unavailable". */
  ai_status?: 'pending' | 'done' | 'unavailable'
}
export type ReportView = Report & ReportExtras

/** Body for POST /api/v1/reports/{report_id}/review (POST because backend CORS allows only GET/POST). */
export interface ReportReviewInput {
  category_user?: ReportCategory
  verification: 'confirmed' | 'rejected'
}

export interface ReplayScenario {
  id: string
  title: string
  event: string
  source: string
  reference_url?: string | null
  onset?: string | null
  expires?: string | null
  area?: string | null
}

export interface BriefingExtras {
  /** Always the template text, even when an LLM narrative exists. */
  deterministic_summary?: string
  narrative?: string | null
  mat_staging?: { site_id: string; vehicle: Vehicle; min_estimate: number; max_estimate: number }[]
  sources?: string[]
}
export type BriefingView = Briefing & BriefingExtras

export interface DisplayExtras {
  /** Which vehicle the beacon is evaluating (today it's encoded only as PKP/HVY in lcd_line1). */
  vehicle?: Vehicle
}
export type DisplayView = Display & DisplayExtras

/** Endpoints the UI uses only once the backend serves them (checked against endpoints.gen.ts). */
export const PROPOSED_ENDPOINTS = {
  reportReview: 'POST /api/v1/reports/{report_id}/review',
  replayScenarios: 'GET /api/v1/replay/scenarios',
  // Shipped by the backend since; kept here so older contracts degrade gracefully.
  demoReset: 'POST /api/v1/demo/reset',
  clearCrewFlag: 'DELETE /api/v1/devices/{device_id}/crew-flag',
} as const
