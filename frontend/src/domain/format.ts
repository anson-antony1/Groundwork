// Display formatting. Missing values always render as "Missing", never as 0.

export const MISSING = 'Missing'

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** "7.4", or "Missing" for null/undefined/NaN. Zero is a real value and renders as "0.0". */
export function fmtNum(value: number | null | undefined, digits = 1): string {
  return isNumber(value) ? value.toFixed(digits) : MISSING
}

/** "43.5 mm", or "Missing". */
export function fmtValue(value: number | null | undefined, unit: string, digits = 1): string {
  return isNumber(value) ? `${value.toFixed(digits)} ${unit}`.trim() : MISSING
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** "$1,900" for a backend-computed amount, or "Missing". */
export function fmtMoney(value: number | null | undefined): string {
  return isNumber(value) ? money.format(value) : MISSING
}

function toDate(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const shortClock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
const dayTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const dayOnly = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "21:00:04" in the laptop's local time. */
export function fmtClock(iso: string | null | undefined): string {
  const d = iso ? toDate(iso) : null
  return d ? clock.format(d) : MISSING
}

/** "21:00". */
export function fmtShortClock(iso: string | null | undefined): string {
  const d = iso ? toDate(iso) : null
  return d ? shortClock.format(d) : MISSING
}

/**
 * "Oct 17, 15:00" for a timestamp, or "Sat, Oct 17" for a date-only value such as an
 * Open-Meteo daily `valid_at` ("2026-10-17"), which has no time of day to show.
 */
export function fmtWhen(value: string | null | undefined): string {
  if (!value) return MISSING
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = toDate(`${value}T00:00:00Z`)
    return d ? dayOnly.format(d) : MISSING
  }
  const d = toDate(value)
  return d ? dayTime.format(d) : MISSING
}

/** Elapsed whole seconds from `iso` to `nowMs`, or null if the timestamp is unusable. */
export function ageSeconds(iso: string | null | undefined, nowMs: number): number | null {
  const d = iso ? toDate(iso) : null
  return d ? Math.max(0, Math.floor((nowMs - d.getTime()) / 1000)) : null
}

/** "just now", "12 s ago", "3 min ago", "2 h ago". */
export function fmtAgo(iso: string | null | undefined, nowMs: number): string {
  const s = ageSeconds(iso, nowMs)
  if (s === null) return MISSING
  if (s < 2) return 'just now'
  if (s < 60) return `${s} s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

/** Human names for backend field/variable identifiers (missing_fields, observation.variable). */
const FIELD_LABELS: Record<string, string> = {
  rain_7d: '7-day rainfall',
  rain_forecast: 'Rain forecast',
  gust_forecast: 'Max wind gust forecast',
  apparent_temp: 'Max apparent temperature',
  nws_alerts: 'NWS alerts',
  usda_soil: 'USDA soil survey',
  demo_tray_moisture: 'Demo tray moisture',
  moisture_index: 'Moisture index',
  light_index: 'Light index',
  pressure_hpa: 'Pressure',
  temp_c: 'Temperature',
}

export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** "standing_water" -> "Standing water". */
export function categoryLabel(category: string | null | undefined): string {
  if (!category) return MISSING
  const text = category.replaceAll('_', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const VEHICLE_LABEL = { pickup: 'Pickup', heavy_truck: 'Heavy truck' } as const
