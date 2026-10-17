// Builds src/mocks/data/sites.json for mock mode from the backend's fixtures (read-only):
// real site coordinates (fixtures/sites_50.json) and real Open-Meteo observations
// (fixtures/weather_snapshot.json), plus an INVENTED status scenario per site so every UI state
// (STOP WORK, CAUTION, MATS, NO-GO, UNKNOWN, stale) can be built and rehearsed before the
// backend computes them. Mock mode labels all of it "Demo fixture — not live data".
//
// Run: npm run gen:mocks   (re-run whenever fixtures/ changes)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))
const { sites } = read('../../fixtures/sites_50.json')
const snapshot = read('../../fixtures/weather_snapshot.json')

// Deterministic PRNG so the fixture is stable across runs (mulberry32).
let seed = 20261017
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (items) => items[Math.floor(rand() * items.length)]
const between = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 10) / 10

// Scenario slots by index into the 60 sites.
const STOP = new Set([6, 22, 41])
const CAUTION = new Set([2, 11, 17, 29, 35, 48, 55])
const UNKNOWN = new Set([4, 14, 26, 38, 52, 58])
const STALE = new Set([9, 44])
const DRAINAGE = ['Poorly drained', 'Somewhat poorly drained', 'Moderately well drained', 'Well drained']
const WORSE = { GO_FOR_REVIEW: 'MATS_FOR_REVIEW', MATS_FOR_REVIEW: 'NO_GO_FOR_REVIEW', NO_GO_FOR_REVIEW: 'NO_GO_FOR_REVIEW' }

const out = sites.map((site, i) => {
  let observations = snapshot.sites[site.id] ?? []
  const stale = STALE.has(i)
  if (stale) observations = observations.map((o) => ({ ...o, quality: o.value === null ? 'missing' : 'stale' }))

  let weather_state = 'NORMAL'
  if (STOP.has(i)) weather_state = 'STOP_WORK'
  else if (CAUTION.has(i)) weather_state = 'CAUTION'
  else if (UNKNOWN.has(i) || stale) weather_state = 'UNKNOWN'

  const subs =
    weather_state === 'UNKNOWN'
      ? null
      : weather_state === 'STOP_WORK'
        ? { rain: between(6, 9), wind: between(6, 9), heat: between(2, 5), flood: between(5, 8), storm: 10 }
        : weather_state === 'CAUTION'
          ? { rain: between(5, 8), wind: between(4, 8), heat: between(4, 7), flood: between(3, 6), storm: between(3, 6) }
          : { rain: between(0, 4), wind: between(0, 4), heat: between(1, 5), flood: between(0, 3), storm: between(0, 2) }
  const hazard_score = subs
    ? Math.round((0.25 * subs.rain + 0.15 * subs.wind + 0.2 * subs.heat + 0.2 * subs.flood + 0.2 * subs.storm) * 10) / 10
    : null

  let pickup = 'UNKNOWN'
  let heavy = 'UNKNOWN'
  if (weather_state !== 'UNKNOWN') {
    const r = rand()
    pickup = r < 0.68 ? 'GO_FOR_REVIEW' : r < 0.94 ? 'MATS_FOR_REVIEW' : 'NO_GO_FOR_REVIEW'
    heavy = rand() < 0.6 ? WORSE[pickup] : pickup
  }

  const missing = weather_state === 'UNKNOWN' ? ['nws_alerts', 'usda_soil'] : []
  const triggers =
    weather_state === 'STOP_WORK'
      ? ['Severe Thunderstorm Warning (demo fixture)']
      : weather_state === 'CAUTION'
        ? [pick(['Gusts above caution policy (demo fixture)', 'Heavy rain forecast (demo fixture)', 'Heat index above caution policy (demo fixture)'])]
        : []

  return {
    id: site.id,
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    region: site.region ?? null,
    location_origin: site.location_origin,
    observations,
    scenario: {
      weather_state,
      hazard_score,
      hazard_subscores: subs,
      access: { pickup, heavy_truck: heavy },
      missing_fields: missing,
      stale,
      alerts:
        weather_state === 'STOP_WORK'
          ? [{ event: 'Severe Thunderstorm Warning', source: 'Demo fixture (not a real NWS alert)', severity: 'Severe', reference_url: null }]
          : [],
      reasons: {
        weather_triggers: triggers,
        soil_drainage: weather_state === 'UNKNOWN' ? null : `${pick(DRAINAGE)} (demo fixture)`,
      },
    },
  }
})

const target = fileURLToPath(new URL('../src/mocks/data/sites.json', import.meta.url))
writeFileSync(target, JSON.stringify({ generated_from: ['fixtures/sites_50.json', 'fixtures/weather_snapshot.json'], snapshot_fetched_at: snapshot.fetched_at, sites: out }, null, 1) + '\n')
const count = (k) => out.filter((s) => s.scenario.weather_state === k).length
console.log(`wrote ${out.length} mock sites: ${count('STOP_WORK')} STOP_WORK, ${count('CAUTION')} CAUTION, ${count('UNKNOWN')} UNKNOWN, ${count('NORMAL')} NORMAL`)
