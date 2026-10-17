// Ranked-list order (README §9 Screen 1): critical alerts first, then high hazard score, then access
// restriction, then missing-data review. This MIRRORS backend/app/services/briefings.py `_priority_key`
// so the map list and the 6 PM briefing agree. When the API sends `priority_rank`, that wins.
import type { AccessCall, Site } from '../api/types'

const ACCESS_RANK: Record<AccessCall, number> = {
  NO_GO_FOR_REVIEW: 0,
  MATS_FOR_REVIEW: 1,
  UNKNOWN: 2,
  GO_FOR_REVIEW: 3,
}

type Rankable = Pick<Site, 'weather_state' | 'hazard_score' | 'access_call' | 'missing_fields'> & { priority_rank?: number }

function priorityKey(s: Rankable): [number, number, number, number] {
  const access = Math.min(...Object.values(s.access_call).map((a) => ACCESS_RANK[a] ?? ACCESS_RANK.UNKNOWN))
  return [s.weather_state === 'STOP_WORK' ? 0 : 1, -(s.hazard_score ?? 0), access, -s.missing_fields.length]
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/** Sorted copy, most urgent first. Ties keep API order, like Python's stable sort. */
export function rankSites<T extends Rankable>(sites: readonly T[]): T[] {
  if (sites.length > 0 && sites.every((s) => typeof s.priority_rank === 'number')) {
    return [...sites].sort((a, b) => a.priority_rank! - b.priority_rank!)
  }
  return sites
    .map((site, index) => ({ site, index, key: priorityKey(site) }))
    .sort((a, b) => compare(a.key, b.key) || a.index - b.index)
    .map((entry) => entry.site)
}
