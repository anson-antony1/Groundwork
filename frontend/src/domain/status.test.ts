import { describe, expect, it } from 'vitest'
import { ACCESS_CALLS, EFFECTIVE_STATUSES, WEATHER_STATES } from '../api/types'
import { accessVisual, beaconVisual, statusVisual, weatherVisual } from './status'

describe('statusVisual', () => {
  it.each(EFFECTIVE_STATUSES)('%s has a label, icon, tone and marker shape', (status) => {
    const v = statusVisual(status)
    expect(v.key).toBe(status)
    expect(v.label.length).toBeGreaterThan(1)
    expect(v.short.length).toBeGreaterThan(1)
    expect(v.hint.length).toBeGreaterThan(10)
    expect(v.icon).toBeTruthy()
    expect(v.shape).toBeTruthy()
  })

  it('uses the beacon color families from README §5.6', () => {
    expect(statusVisual('GO_FOR_REVIEW').tone).toBe('go')
    expect(statusVisual('MATS_FOR_REVIEW').tone).toBe('caution')
    expect(statusVisual('SUPERVISOR_REVIEW').tone).toBe('caution')
    expect(statusVisual('NO_GO_FOR_REVIEW').tone).toBe('nogo')
    expect(statusVisual('STOP_WORK').tone).toBe('stop')
    expect(statusVisual('UNKNOWN').tone).toBe('unknown')
  })

  it('maps each status to the display code the backend sends the beacon', () => {
    expect(EFFECTIVE_STATUSES.map((s) => [s, statusVisual(s).beacon])).toEqual([
      ['GO_FOR_REVIEW', 'GO'],
      ['MATS_FOR_REVIEW', 'MATS'],
      ['SUPERVISOR_REVIEW', 'REVIEW'],
      ['NO_GO_FOR_REVIEW', 'NOGO'],
      ['STOP_WORK', 'STOP'],
      ['UNKNOWN', 'UNKNOWN'],
    ])
  })

  it('gives every status its own marker shape, so color is never the only cue', () => {
    const shapes = EFFECTIVE_STATUSES.map((s) => statusVisual(s).shape)
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it.each([undefined, null, '', 'GO', 'go_for_review', 'SAFE', 'toString', '__proto__'])(
    'renders unrecognized value %j as UNKNOWN, never as safe',
    (value) => {
      expect(statusVisual(value as string).key).toBe('UNKNOWN')
    },
  )

  it('never shows stale data or a lost link in a safe tone', () => {
    for (const key of ['STALE', 'NO_LINK', 'UNKNOWN']) {
      expect(statusVisual(key).tone).toBe('unknown')
      expect(statusVisual(key).beacon).toBe('UNKNOWN')
    }
  })

  it('covers every access call', () => {
    for (const call of ACCESS_CALLS) expect(accessVisual(call).key).toBe(call)
  })
})

describe('weatherVisual', () => {
  it.each(WEATHER_STATES)('%s maps to itself', (state) => {
    expect(weatherVisual(state).state).toBe(state)
  })

  it('treats STOP_WORK as the stop tone and anything unrecognized as UNKNOWN', () => {
    expect(weatherVisual('STOP_WORK').tone).toBe('stop')
    expect(weatherVisual('SUNNY').state).toBe('UNKNOWN')
    expect(weatherVisual(null).tone).toBe('unknown')
  })
})

describe('beaconVisual (README §5.6 table)', () => {
  it.each([
    ['GO', 'green', 'off', 'on'],
    ['MATS', 'amber', 'on', 'on'],
    ['REVIEW', 'amber', 'on', 'on'],
    ['NOGO', 'red', 'on', 'off'],
    ['STOP', 'red', 'blink', 'off'],
    ['UNKNOWN', 'white', 'alternate', 'alternate'],
    ['NO_LINK', 'white', 'alternate', 'alternate'],
  ] as const)('%s: backlight %s, red LED %s, green LED %s', (code, backlight, red, green) => {
    expect(beaconVisual(code, false)).toMatchObject({ backlight, red, green })
  })

  it('pulses the buzzer only for an unacknowledged STOP', () => {
    expect(beaconVisual('STOP', true).buzzer).toBe('pulse')
    expect(beaconVisual('STOP', false).buzzer).toBe('off')
    expect(beaconVisual('NOGO', true).buzzer).toBe('off')
  })

  it('never lights green alone for an unrecognized code', () => {
    expect(beaconVisual('BOGUS', false)).toMatchObject({ code: 'UNKNOWN', backlight: 'white' })
  })
})
