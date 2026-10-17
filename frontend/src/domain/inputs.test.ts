import { describe, expect, it } from 'vitest'
import type { Observation } from '../api/types'
import { inputsSummary } from './inputs'

const obs = (variable: string, value: number | null, quality: Observation['quality'] = 'available'): Observation => ({
  variable,
  value,
  unit: 'mm',
  source: 'Open-Meteo',
  kind: 'forecast',
  valid_at: '2026-10-17',
  fetched_at: '2026-10-17T03:52:55Z',
  quality,
  reference_url: null,
})

describe('inputsSummary', () => {
  it('counts present observations against everything expected', () => {
    const s = inputsSummary({
      observations: [obs('rain_7d', 43.5), obs('rain_forecast', 0), obs('gust_forecast', 52.6), obs('apparent_temp', null, 'missing')],
      missing_fields: ['apparent_temp', 'nws_alerts', 'usda_soil'],
      data_status: 'available',
    })
    expect(s).toEqual({ have: 3, total: 6, missing: ['apparent_temp', 'nws_alerts', 'usda_soil'], stale: false })
  })

  it('counts a real zero as present', () => {
    expect(inputsSummary({ observations: [obs('rain_forecast', 0)], missing_fields: [], data_status: 'available' }).have).toBe(1)
  })

  it('flags stale data', () => {
    expect(inputsSummary({ observations: [obs('rain_7d', 4, 'stale')], missing_fields: [], data_status: 'stale' }).stale).toBe(true)
  })
})
