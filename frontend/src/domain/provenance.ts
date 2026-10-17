// Real-vs-simulated labels. The fixed strings are verbatim from README §15; don't reword them.
import type { DataMode, Observation, ObservationQuality } from '../api/types'
import { fmtWhen } from './format'

export const LABELS = {
  demoSensor: 'Demo sensor • not on-site measurement',
  demoBeacon: 'Demo beacon • venue observation • advisory only',
  beaconOutputs: 'Displays server status • not an independent safety device',
  recordedDemo: 'Recorded demo',
  scenarioAssumption: 'Scenario assumption • adjustable',
  prototypePolicy: 'Prototype policy • supervisor review required',
  aiTag: 'AI suggested • unverified',
  aiTagReview: 'AI suggested · needs human review',
  llmBriefing: 'Generated narrative from structured records',
  illustrativeCost: 'Illustrative estimate — edit assumptions',
  demoFixture: 'Demo fixture — not live data',
} as const

export function surveyLabel(source: string, fetchedAt: string | null | undefined): string {
  return `Survey data • ${source} • fetched ${fmtWhen(fetchedAt)}`
}

export function forecastLabel(source: string, validAt: string | null | undefined): string {
  return `Forecast/model data • ${source} • valid ${fmtWhen(validAt)}`
}

export function replayLabel(reference: string | null | undefined): string {
  return `Historical replay • source ${reference ?? 'not attached'}`
}

/**
 * First sentence of a replay source, for banners. If the full source says its alert is simulated,
 * that stays visible ("· alert simulated") however short the line gets.
 */
export function shortReplaySource(source: string | null | undefined): string | null {
  if (!source) return null
  const first = source.split(/(?<=\.)\s+/)[0].replace(/\.$/, '')
  return /simulated/i.test(source) && !/simulated/i.test(first) ? `${first} · alert simulated` : first
}

/** Provenance line for one sourced value, chosen by its kind. */
export function observationLabel(o: Pick<Observation, 'kind' | 'source' | 'valid_at' | 'fetched_at'>): string {
  switch (o.kind) {
    case 'survey':
      return surveyLabel(o.source, o.fetched_at)
    case 'forecast':
    case 'modeled':
      return forecastLabel(o.source, o.valid_at)
    case 'observed':
      return `Observed data • ${o.source} • valid ${fmtWhen(o.valid_at)}`
  }
}

export const MODE_LABEL: Record<DataMode, string> = {
  live: 'Live',
  cached: 'Cached snapshot',
  replay: 'Historical replay',
  simulated: 'Simulated',
  sensor_demo: 'Demo sensor',
  sensor_replay: 'Recorded demo',
}

/**
 * "Recorded demo" (README §15) promises readings recorded from the real beacon. A replay CSV whose
 * calibration says simulated (replay_sensor_v2.py posts simulated_replay_v1) must say so instead.
 */
export function sensorReplayLabel(calibration: string | null | undefined): string {
  return calibration?.toLowerCase().startsWith('simulated') ? 'Simulated sensor replay' : LABELS.recordedDemo
}

export const QUALITY_LABEL: Record<ObservationQuality, string> = {
  available: 'Available',
  stale: 'Stale',
  missing: 'Missing',
  simulated: 'Simulated',
  sensor_demo: 'Demo sensor',
  sensor_replay: 'Recorded demo',
}
