import type { ReplayScenario } from '../../api/proposed'

/**
 * The backend's two replay fixtures (backend/app/services/storm_replay_v2.py SCENARIO_FILES), for a
 * backend that doesn't serve GET /replay/scenarios yet. Current backends list them, with their sources.
 */
export const BUILT_IN_SCENARIOS: ReplayScenario[] = [
  {
    id: 'demo-storm',
    title: 'Hurricane Milton · Oct 9 2024',
    event: 'Storm day',
    source: 'Archived weather for the day (fixtures/storm_replay.json)',
  },
  {
    id: 'calm-day',
    title: 'Calm summer day · Jul 15 2024',
    event: 'Comparison day',
    source: 'Archived weather for the day (fixtures/replay_calm.json)',
  },
]
