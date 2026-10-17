// Builds src/mocks/data/replays.json for mock mode from the backend's replay fixtures (read-only), so
// a mock replay shows the same per-site hazard and weather state as the live API's:
//   demo-storm -> fixtures/storm_replay.json (Hurricane Milton, real archived weather, simulated warning)
//   calm-day   -> fixtures/replay_calm.json  (an ordinary day, real archived weather, no alert assumed)
// The ids match backend/app/services/storm_replay_v2.py SCENARIO_FILES.
//
// Run: npm run gen:mocks   (re-run whenever fixtures/ changes)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))

const FILES = { 'demo-storm': 'storm_replay.json', 'calm-day': 'replay_calm.json' }

const scenarios = Object.fromEntries(
  Object.entries(FILES).map(([id, file]) => {
    const f = read(`../../fixtures/${file}`)
    const sites = Object.fromEntries(Object.entries(f.sites).map(([siteId, s]) => [siteId, [s.hazard_score, s.weather_state]]))
    return [id, { label: f.label ?? f.scenario_id, day: f.storm_day ?? f.day, alert: f.simulated_alert ?? null, source: f.source, sites }]
  }),
)

const target = fileURLToPath(new URL('../src/mocks/data/replays.json', import.meta.url))
writeFileSync(target, JSON.stringify({ generated_from: Object.values(FILES).map((f) => `fixtures/${f}`), scenarios }, null, 1) + '\n')
for (const [id, s] of Object.entries(scenarios)) {
  const states = Object.values(s.sites).map(([, state]) => state)
  const count = (k) => states.filter((x) => x === k).length
  console.log(`${id}: ${states.length} sites, ${count('STOP_WORK')} STOP_WORK, ${count('CAUTION')} CAUTION, ${count('NORMAL')} NORMAL`)
}
