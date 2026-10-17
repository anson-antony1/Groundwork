import { describe, expect, it } from 'vitest'
import { DATA_MODES, OBSERVATION_QUALITIES } from '../api/types'
import { LABELS, MODE_LABEL, QUALITY_LABEL, forecastLabel, observationLabel, replayLabel, surveyLabel } from './provenance'

describe('README §15 labels are verbatim', () => {
  it('keeps the fixed strings exactly', () => {
    expect(LABELS).toMatchObject({
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
    })
  })

  it('builds the sourced labels in the README format', () => {
    expect(surveyLabel('USDA', '2026-10-16T22:00:00Z')).toMatch(/^Survey data • USDA • fetched /)
    expect(forecastLabel('Open-Meteo', '2026-10-17')).toMatch(/^Forecast\/model data • Open-Meteo • valid Sat/)
    expect(replayLabel('NWS warning 123')).toBe('Historical replay • source NWS warning 123')
    expect(replayLabel(null)).toBe('Historical replay • source not attached')
  })

  it('labels observations by kind', () => {
    const base = { source: 'Open-Meteo', valid_at: '2026-10-17', fetched_at: '2026-10-17T03:52:55Z' }
    expect(observationLabel({ ...base, kind: 'forecast' })).toMatch(/^Forecast\/model data/)
    expect(observationLabel({ ...base, kind: 'modeled' })).toMatch(/^Forecast\/model data/)
    expect(observationLabel({ ...base, kind: 'survey', source: 'USDA' })).toMatch(/^Survey data • USDA/)
    expect(observationLabel({ ...base, kind: 'observed' })).toMatch(/^Observed data/)
  })

  it('names every data mode and quality', () => {
    for (const mode of DATA_MODES) expect(MODE_LABEL[mode]).toBeTruthy()
    for (const q of OBSERVATION_QUALITIES) expect(QUALITY_LABEL[q]).toBeTruthy()
    expect(MODE_LABEL.sensor_replay).toBe('Recorded demo')
    expect(MODE_LABEL.replay).toBe('Historical replay')
  })
})
