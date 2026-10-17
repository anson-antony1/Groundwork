import { describe, expect, it } from 'vitest'
import type { AccessCall, WeatherState } from '../api/types'
import { rankSites } from './ranking'

function site(
  id: string,
  weather_state: WeatherState,
  hazard_score: number | null,
  access: [AccessCall, AccessCall] = ['GO_FOR_REVIEW', 'GO_FOR_REVIEW'],
  missing = 0,
  priority_rank?: number,
) {
  return {
    id,
    weather_state,
    hazard_score,
    access_call: { pickup: access[0], heavy_truck: access[1] },
    missing_fields: Array.from({ length: missing }, (_, i) => `f${i}`),
    priority_rank,
  }
}

const ids = (list: { id: string }[]) => list.map((s) => s.id)

describe('rankSites (mirrors briefings._priority_key)', () => {
  it('puts STOP WORK first even when another site scores higher', () => {
    expect(ids(rankSites([site('calm', 'CAUTION', 9.5), site('storm', 'STOP_WORK', 2.0)]))).toEqual(['storm', 'calm'])
  })

  it('then sorts by hazard score, high to low, treating missing as 0', () => {
    expect(ids(rankSites([site('a', 'NORMAL', 2.1), site('b', 'NORMAL', 7.4), site('c', 'UNKNOWN', null)]))).toEqual(['b', 'a', 'c'])
  })

  it('then by the most restrictive access call across vehicles', () => {
    const ranked = rankSites([
      site('go', 'NORMAL', 3, ['GO_FOR_REVIEW', 'GO_FOR_REVIEW']),
      site('nogo', 'NORMAL', 3, ['GO_FOR_REVIEW', 'NO_GO_FOR_REVIEW']),
      site('mats', 'NORMAL', 3, ['MATS_FOR_REVIEW', 'MATS_FOR_REVIEW']),
    ])
    expect(ids(ranked)).toEqual(['nogo', 'mats', 'go'])
  })

  it('then by how much data is missing, and keeps API order for exact ties', () => {
    const ranked = rankSites([site('x', 'UNKNOWN', null, ['UNKNOWN', 'UNKNOWN'], 1), site('y', 'UNKNOWN', null, ['UNKNOWN', 'UNKNOWN'], 2), site('z', 'UNKNOWN', null, ['UNKNOWN', 'UNKNOWN'], 1)])
    expect(ids(ranked)).toEqual(['y', 'x', 'z'])
  })

  it('uses the server rank when every site has one', () => {
    expect(ids(rankSites([site('a', 'STOP_WORK', 9, undefined, 0, 2), site('b', 'NORMAL', 1, undefined, 0, 1)]))).toEqual(['b', 'a'])
  })
})
