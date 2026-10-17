import { DEMO_SITE_ID } from '../api/config'

/** Top-level screens, in demo order. `key` is the number-row hotkey. */
export const NAV = [
  { to: '/', label: 'Map', key: '1' },
  { to: `/sites/${DEMO_SITE_ID}`, label: 'Demo tray', key: '2' },
  { to: '/sensor-lab', label: 'Sensor lab', key: '3' },
  { to: '/replay', label: 'Storm replay', key: '4' },
  { to: '/briefing', label: '6 PM brief', key: '5' },
] as const
