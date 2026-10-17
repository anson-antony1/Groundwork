// Mock GET /api/v1/coverage and GET /api/v1/sensors/{device_id}/pressure-tendency, with the backend's rules.
import type { SiteView } from '../api/proposed'
import type { Coverage, PressureTendency } from '../api/types'
import { db, iso } from './db'
import { DEMO_SITE_ID, allSiteStatuses } from './rules'

// Coverage of the mock sites, counted the way backend/app/api/health.py counts the snapshot.
const COVERAGE_WEATHER = ['rain_7d', 'rain_forecast', 'gust_forecast', 'apparent_temp', 'nws_alerts']
const STALE_AFTER_HOURS = 6

export function coverage(now: number): Coverage {
  const sites = allSiteStatuses(now).filter((s) => s.id !== DEMO_SITE_ID)
  const has = (s: SiteView, variable: string) => s.observations.some((o) => o.variable === variable && o.value !== null)
  const fetched = new Map<string, number[]>()
  let withWeather = 0, withSoil = 0, withBoth = 0
  for (const s of sites) {
    const weather = COVERAGE_WEATHER.every((v) => has(s, v))
    const soil = has(s, 'usda_soil')
    withWeather += Number(weather)
    withSoil += Number(soil)
    withBoth += Number(weather && soil)
    for (const o of s.observations) fetched.set(o.source, [...(fetched.get(o.source) ?? []), Date.parse(o.fetched_at)])
  }
  const freshness = [...fetched.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([source, times]) => {
    times.sort((a, b) => a - b)
    return {
      source, observations: times.length, oldest_fetched_at: iso(times[0]),
      median_fetched_at: iso(times[Math.floor(times.length / 2)]), newest_fetched_at: iso(times[times.length - 1]),
      stale: now - times[0] > STALE_AFTER_HOURS * 3600_000,
    }
  })
  return {
    total_sites: sites.length, sites_with_usda_soil: withSoil, sites_with_weather: withWeather, sites_with_both: withBoth,
    sites_with_missing: sites.length - withBoth, stale_after_hours: STALE_AFTER_HOURS, freshness,
  }
}

// Same rules as backend/app/services/pressure.py: live (sensor_demo) readings only, 3 h window,
// 10-minute averages at each end, UNKNOWN rather than "steady" when the history is short.
const PRESSURE = { windowMs: 3 * 3600_000, endpointMs: 10 * 60_000, freshMs: 15 * 60_000 }
const PRESSURE_ADVISORY = 'Advisory only: venue station pressure from the demo beacon; never a STOP WORK trigger.'

function classifyPressure(change: number): PressureTendency['tendency'] {
  const size = Math.abs(change)
  if (size < 0.1) return 'STEADY'
  const dir = change > 0 ? 'RISING' : 'FALLING'
  if (size < 1.6) return `${dir}_SLOWLY`
  if (size < 3.6) return dir
  return size <= 6 ? `${dir}_QUICKLY` : `${dir}_VERY_RAPIDLY`
}

export function pressureTendency(deviceId: string, now: number): PressureTendency {
  const since = now - PRESSURE.windowMs - 2 * PRESSURE.endpointMs
  const rows = db.readings
    .filter((r) => r.mode === 'sensor_demo' && r.pressure_hpa !== null && Date.parse(r.received_at) >= since)
    .map((r) => ({ at: Date.parse(r.recorded_at), received: Date.parse(r.received_at), hpa: r.pressure_hpa as number }))
  const base = { device_id: deviceId, window_hours: 3, samples: rows.length, advisory: PRESSURE_ADVISORY }
  const unknown = (reason: string): PressureTendency => ({ ...base, tendency: 'UNKNOWN', change_hpa: null, start_at: null, end_at: null, reason })
  if (!rows.length) return unknown('No live barometer readings in the last 3 hours.')
  const latest = rows.reduce((a, b) => (b.at > a.at ? b : a))
  if (now - latest.received > PRESSURE.freshMs) return unknown('No live barometer reading in the last 15 minutes.')
  const target = latest.at - PRESSURE.windowMs
  const earliest = Math.min(...rows.map((r) => r.at))
  if (earliest > target + PRESSURE.endpointMs) {
    return unknown(`Only ${((latest.at - earliest) / 3600_000).toFixed(1)} h of live barometer history; a tendency needs 3 h.`)
  }
  const start = rows.filter((r) => Math.abs(r.at - target) <= PRESSURE.endpointMs)
  if (!start.length) return unknown('No barometer readings from about 3 hours ago (gap in the log).')
  const end = rows.filter((r) => r.at >= latest.at - PRESSURE.endpointMs)
  const mean = (rs: typeof rows) => rs.reduce((sum, r) => sum + r.hpa, 0) / rs.length
  const change = Math.round((mean(end) - mean(start)) * 100) / 100
  const tendency = classifyPressure(change)
  const sign = change >= 0 ? '+' : ''
  return {
    ...base, tendency, change_hpa: change, start_at: iso(Math.min(...start.map((r) => r.at))), end_at: iso(latest.at),
    reason: `Station pressure changed ${sign}${change.toFixed(2)} hPa over 3 hours (${tendency.replace(/_/g, ' ').toLowerCase()}).`,
  }
}
