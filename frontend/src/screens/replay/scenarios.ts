import type { ReplayScenario } from '../../api/proposed'

/**
 * The backend's two replay fixtures (backend/app/services/storm_replay_v2.py SCENARIO_FILES), shown
 * until it serves GET /replay/scenarios. In both, the weather is real archived data and the alert
 * side is simulated or assumed, because historical NWS alerts aren't available.
 */
export const BUILT_IN_SCENARIOS: ReplayScenario[] = [
  {
    id: 'demo-storm',
    title: 'Hurricane Milton · Oct 9 2024',
    event: 'Hurricane Warning (simulated)',
    source: 'Real Open-Meteo archive weather for the forecast day; the warning is simulated (fixtures/storm_replay.json)',
  },
  {
    id: 'calm-day',
    title: 'Calm summer day · Jul 15 2024',
    event: 'No alert assumed',
    source: 'Real Open-Meteo archive weather; no alert is assumed, a simulated assumption (fixtures/replay_calm.json)',
  },
]
