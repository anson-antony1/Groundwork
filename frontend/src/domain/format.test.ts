import { describe, expect, it } from 'vitest'
import { MISSING, ageSeconds, categoryLabel, fieldLabel, fmtAgo, fmtMoney, fmtNum, fmtObservation, fmtValue, fmtWhen } from './format'

describe('missing values never render as zero', () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])('fmtNum(%s) is "Missing"', (value) => {
    expect(fmtNum(value)).toBe(MISSING)
  })

  it('keeps a real zero as zero', () => {
    expect(fmtNum(0)).toBe('0.0')
    expect(fmtValue(0, 'mm')).toBe('0.0 mm')
  })

  it('formats values with units', () => {
    expect(fmtNum(7.44)).toBe('7.4')
    expect(fmtValue(43.5, 'mm')).toBe('43.5 mm')
    expect(fmtValue(null, 'mm')).toBe(MISSING)
  })

  it('formats backend-computed money and leaves missing money missing', () => {
    expect(fmtMoney(1900)).toBe('$1,900')
    expect(fmtMoney(null)).toBe(MISSING)
  })
})

describe('time formatting', () => {
  const now = Date.parse('2026-10-17T21:00:30Z')

  it('describes age in plain words', () => {
    expect(fmtAgo('2026-10-17T21:00:29.5Z', now)).toBe('just now')
    expect(fmtAgo('2026-10-17T21:00:18Z', now)).toBe('12 s ago')
    expect(fmtAgo('2026-10-17T20:57:30Z', now)).toBe('3 min ago')
    expect(fmtAgo('2026-10-17T19:00:00Z', now)).toBe('2 h ago')
    expect(fmtAgo(null, now)).toBe(MISSING)
    expect(fmtAgo('not a date', now)).toBe(MISSING)
  })

  it('never reports a negative age', () => {
    expect(ageSeconds('2026-10-17T21:01:00Z', now)).toBe(0)
  })

  it('shows date-only values as a calendar day', () => {
    expect(fmtWhen('2026-10-17')).toMatch(/Sat.*Oct.*17/)
    expect(fmtWhen(undefined)).toBe(MISSING)
  })
})

describe('fmtObservation', () => {
  it('spells out the backend units that read badly raw', () => {
    expect(fmtObservation({ variable: 'nws_alerts', value: 0, unit: 'count' })).toBe('None active')
    expect(fmtObservation({ variable: 'nws_alerts', value: 2, unit: 'count' })).toBe('2 active')
    expect(fmtObservation({ variable: 'usda_soil', value: 3, unit: 'drainage wetness rank 0-4' })).toBe('3 of 4 (wetness rank)')
    expect(fmtObservation({ variable: 'usda_clay_pct', value: 1.5, unit: '%' })).toBe('1.5%')
    expect(fmtObservation({ variable: 'rain_7d', value: 43.5, unit: 'mm' })).toBe('1.71 in')
    expect(fmtObservation({ variable: 'gust_forecast', value: 80, unit: 'km/h' })).toBe('50 mph')
    expect(fmtObservation({ variable: 'apparent_temp', value: 32, unit: '°C' })).toBe('90 °F')
  })

  it('keeps missing observations missing', () => {
    expect(fmtObservation({ variable: 'nws_alerts', value: null, unit: 'count' })).toBe(MISSING)
  })
})

describe('labels', () => {
  it('names known fields and falls back to readable text', () => {
    expect(fieldLabel('rain_7d')).toBe('7-day rainfall')
    expect(fieldLabel('nws_alerts')).toBe('NWS alerts')
    expect(fieldLabel('soil_moisture_index')).toBe('Soil moisture index')
  })

  it('formats report categories', () => {
    expect(categoryLabel('standing_water')).toBe('Standing water')
    expect(categoryLabel(null)).toBe(MISSING)
  })
})
