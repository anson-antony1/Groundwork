// Live vs historical-replay separation (README P13, §9 Screen 4: "don't blend contexts").
// The server owns replay state; GET /replay tells us which context we're in. Every status-bearing
// query key ends with the context, so live and replay data sit in separate caches and switching
// drops the old context's cache wholesale.
import { ContextMismatchError } from './errors'
import type { DataMode, Replay } from './types'

/** "live" (live or cached data), or one specific replay run. */
export type ServerCtx = 'live' | `replay:${string}`

/** Each replay run gets its own context, so a second run never reuses the first one's cache. */
export function ctxOf(replay: Pick<Replay, 'active' | 'scenario_id' | 'started_at'>): ServerCtx {
  return replay.active ? `replay:${replay.scenario_id ?? 'scenario'}:${replay.started_at ?? ''}` : 'live'
}

export function isReplayCtx(ctx: ServerCtx): boolean {
  return ctx !== 'live'
}

/**
 * Mode guard: throws if a response belongs to the other context (e.g. it raced a replay start or stop).
 * The query then errors instead of rendering live data during a replay, or replay data after it ended.
 */
export function assertModeMatches(mode: DataMode, ctx: ServerCtx): void {
  if ((mode === 'replay') !== isReplayCtx(ctx)) throw new ContextMismatchError(isReplayCtx(ctx), mode)
}

/** Context-scoped query keys end with their context. */
export function belongsToCtx(queryKey: readonly unknown[], ctx: ServerCtx): boolean {
  return queryKey[queryKey.length - 1] === ctx
}
