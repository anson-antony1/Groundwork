// The one place that turns backend status values into what the UI shows: label, icon, tone,
// marker shape and the beacon code. The UI never computes a status; it only renders these.
// Unrecognized values render as UNKNOWN, never as anything that could read as safe.
import type { LucideIcon } from 'lucide-react'
import {
  Ban,
  CircleCheck,
  CircleHelp,
  Clock,
  CloudSun,
  Layers,
  OctagonX,
  TriangleAlert,
  Unplug,
  UserCheck,
} from 'lucide-react'
import type { AccessCall, DisplayCode, EffectiveStatus, WeatherState } from '../api/types'

/** Color family. Matches the beacon (README §5.6): green GO, amber MATS/REVIEW, red NO-GO/STOP, white UNKNOWN. */
export type Tone = 'go' | 'caution' | 'nogo' | 'stop' | 'unknown'

/** Marker silhouettes, so status never depends on color alone. */
export type MarkerShape = 'circle' | 'triangle' | 'square' | 'diamond' | 'octagon' | 'ring'

/** Effective statuses plus two UI-only states that withhold a status instead of showing an old one. */
export type StatusKey = EffectiveStatus | 'STALE' | 'NO_LINK'

export interface StatusVisual {
  key: StatusKey
  tone: Tone
  /** Full label, e.g. "MATS · FOR REVIEW". */
  label: string
  /** Compact label for tight spaces, e.g. "MATS". */
  short: string
  /** One plain-English line explaining the call. */
  hint: string
  icon: LucideIcon
  shape: MarkerShape
  /** Serial code the beacon shows for this status (README §5.6). */
  beacon: DisplayCode
}

const STATUS: Record<StatusKey, StatusVisual> = {
  GO_FOR_REVIEW: {
    key: 'GO_FOR_REVIEW',
    tone: 'go',
    label: 'GO',
    short: 'GO',
    hint: 'Ground is firm enough for this vehicle, and the weather allows work.',
    icon: CircleCheck,
    shape: 'circle',
    beacon: 'GO',
  },
  MATS_FOR_REVIEW: {
    key: 'MATS_FOR_REVIEW',
    tone: 'caution',
    label: 'MATS',
    short: 'MATS',
    hint: 'Ground is soft. Lay mats before this vehicle drives in.',
    icon: Layers,
    shape: 'triangle',
    beacon: 'MATS',
  },
  SUPERVISOR_REVIEW: {
    key: 'SUPERVISOR_REVIEW',
    tone: 'caution',
    label: 'SUPERVISOR REVIEW',
    short: 'REVIEW',
    hint: 'A supervisor decides: weather caution, a wildfire within 10 miles, or a crew flag (someone at the site held the beacon’s button to report a problem).',
    icon: UserCheck,
    shape: 'square',
    beacon: 'REVIEW',
  },
  NO_GO_FOR_REVIEW: {
    key: 'NO_GO_FOR_REVIEW',
    tone: 'nogo',
    label: 'NO-GO',
    short: 'NO-GO',
    hint: 'Ground is too soft for this vehicle, even with mats.',
    icon: Ban,
    shape: 'diamond',
    beacon: 'NOGO',
  },
  STOP_WORK: {
    key: 'STOP_WORK',
    tone: 'stop',
    label: 'STOP WORK',
    short: 'STOP',
    hint: "Dangerous weather. Nobody works, any vehicle. Mats don't help.",
    icon: OctagonX,
    shape: 'octagon',
    beacon: 'STOP',
  },
  UNKNOWN: {
    key: 'UNKNOWN',
    tone: 'unknown',
    label: 'UNKNOWN · NO DATA',
    short: 'UNKNOWN',
    hint: "Data is missing or old, so it's never shown as safe.",
    icon: CircleHelp,
    shape: 'ring',
    beacon: 'UNKNOWN',
  },
  STALE: {
    key: 'STALE',
    tone: 'unknown',
    label: 'STALE · NO RECENT UPDATE',
    short: 'STALE',
    hint: 'The last update is too old to trust.',
    icon: Clock,
    shape: 'ring',
    beacon: 'UNKNOWN',
  },
  NO_LINK: {
    key: 'NO_LINK',
    tone: 'unknown',
    label: 'NO LINK',
    short: 'NO LINK',
    hint: 'No recent data from the beacon.',
    icon: Unplug,
    shape: 'ring',
    beacon: 'UNKNOWN',
  },
}

/** Display order for legends and filters: most severe first, UNKNOWN last. */
export const STATUS_ORDER: readonly StatusKey[] = [
  'STOP_WORK',
  'NO_GO_FOR_REVIEW',
  'MATS_FOR_REVIEW',
  'SUPERVISOR_REVIEW',
  'GO_FOR_REVIEW',
  'UNKNOWN',
]

function isStatusKey(value: string): value is StatusKey {
  return Object.hasOwn(STATUS, value)
}

/** Visual for an effective status or access call. Anything unrecognized renders as UNKNOWN. */
export function statusVisual(value: string | null | undefined): StatusVisual {
  return value && isStatusKey(value) ? STATUS[value] : STATUS.UNKNOWN
}

/** Access calls are a subset of effective statuses. */
export function accessVisual(value: AccessCall | null | undefined): StatusVisual {
  return statusVisual(value)
}

export interface WeatherVisual {
  state: WeatherState
  tone: Tone
  label: string
  hint: string
  icon: LucideIcon
}

const WEATHER: Record<WeatherState, WeatherVisual> = {
  NORMAL: {
    state: 'NORMAL',
    tone: 'go',
    label: 'NORMAL',
    hint: 'No weather warning and no high-risk forecast.',
    icon: CloudSun,
  },
  CAUTION: {
    state: 'CAUTION',
    tone: 'caution',
    label: 'CAUTION',
    hint: 'Weather to watch. A supervisor reviews before work.',
    icon: TriangleAlert,
  },
  STOP_WORK: {
    state: 'STOP_WORK',
    tone: 'stop',
    label: 'STOP WORK',
    hint: 'Dangerous weather: every vehicle stops. It cannot be averaged away.',
    icon: OctagonX,
  },
  UNKNOWN: {
    state: 'UNKNOWN',
    tone: 'unknown',
    label: 'UNKNOWN',
    hint: "Weather data is missing or old, so the site is never shown as safe.",
    icon: CircleHelp,
  },
}

export function weatherVisual(value: string | null | undefined): WeatherVisual {
  return value && Object.hasOwn(WEATHER, value) ? WEATHER[value as WeatherState] : WEATHER.UNKNOWN
}

/** LED and buzzer behavior for each beacon code, exactly as README §5.6 specifies. */
export type LedState = 'off' | 'on' | 'blink' | 'alternate'
export type Backlight = 'green' | 'amber' | 'red' | 'white'

export interface BeaconVisual {
  code: DisplayCode | 'NO_LINK'
  backlight: Backlight
  red: LedState
  green: LedState
  /** Pulses only while a STOP_WORK alarm is unacknowledged. */
  buzzer: 'off' | 'pulse'
}

const BEACON: Record<DisplayCode | 'NO_LINK', Omit<BeaconVisual, 'code' | 'buzzer'>> = {
  GO: { backlight: 'green', red: 'off', green: 'on' },
  MATS: { backlight: 'amber', red: 'on', green: 'on' },
  REVIEW: { backlight: 'amber', red: 'on', green: 'on' },
  NOGO: { backlight: 'red', red: 'on', green: 'off' },
  STOP: { backlight: 'red', red: 'blink', green: 'off' },
  UNKNOWN: { backlight: 'white', red: 'alternate', green: 'alternate' },
  NO_LINK: { backlight: 'white', red: 'alternate', green: 'alternate' },
}

export function beaconVisual(code: string | null | undefined, alarm: boolean): BeaconVisual {
  const key = code && Object.hasOwn(BEACON, code) ? (code as DisplayCode | 'NO_LINK') : 'UNKNOWN'
  return { code: key, ...BEACON[key], buzzer: key === 'STOP' && alarm ? 'pulse' : 'off' }
}
