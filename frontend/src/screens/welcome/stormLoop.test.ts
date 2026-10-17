import { describe, expect, it } from 'vitest'
import { CALM_AT, LOOP_S, SITES, STILL_T, bandAt, countsAt, phaseAt, statusAt } from './stormLoop'

describe('/welcome storm loop', () => {
  it('draws all 60 real substations', () => {
    expect(SITES).toHaveLength(60)
    const total = (t: number) => Object.values(countsAt(t)).reduce((a, b) => a + b, 0)
    for (const t of [0, 2, STILL_T, 8, CALM_AT, LOOP_S - 0.01]) expect(total(t)).toBe(60)
  })

  it('starts calm, stops work under the band, then leaves mats where the ground stays wet', () => {
    expect(countsAt(0).STOP).toBe(0)
    expect(countsAt(STILL_T).STOP).toBeGreaterThan(0)
    expect(bandAt(STILL_T)).not.toBeNull()
    const after = countsAt(7.6)
    expect(after.STOP).toBe(0)
    expect(after.MATS).toBeGreaterThan(countsAt(0).MATS)
  })

  it('loops seamlessly: the last frame matches the first', () => {
    for (const site of SITES) expect(statusAt(site, LOOP_S - 0.01)).toBe(statusAt(site, 0))
  })

  it('names each phase', () => {
    expect(phaseAt(0)).toMatch(/^Calm/)
    expect(phaseAt(STILL_T)).toMatch(/^Storm crossing/)
    expect(phaseAt(9)).toMatch(/^Ground drying/)
    expect(phaseAt(CALM_AT + 0.1)).toMatch(/^Calm/)
  })
})
