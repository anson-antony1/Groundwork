// "UNKNOWN or stale data never looks safe or green": a status view that hasn't refreshed within its
// budget, or whose last poll failed, renders as STALE instead of showing its last known status.

/** Age budgets per view, in ms. The Sensor Lab matches the beacon's own 6 s NO LINK rule (README §5.6). */
export const STALE_BUDGET_MS = {
  beacon: 6_000,
  site: 10_000,
  map: 30_000,
} as const

export interface StalenessInput {
  /** When the data last refreshed successfully (ms epoch), or 0 if it never has. */
  updatedAt: number
  now: number
  budgetMs: number
  /** The latest poll failed (after retries). */
  failed: boolean
}

/** True when the view must withhold its status. Never-loaded data isn't "stale"; it's still loading. */
export function isStale({ updatedAt, now, budgetMs, failed }: StalenessInput): boolean {
  if (updatedAt === 0) return false
  return failed || now - updatedAt > budgetMs
}
