import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './client'
import { belongsToCtx, ctxOf, isReplayCtx } from './context'
import type { ServerCtx } from './context'
import { qk } from './queryKeys'
import { ServerCtxContext } from './serverCtx'
import type { ServerCtxValue } from './serverCtx'
import type { Envelope, Replay } from './types'

const SWITCH_MS = 700

/** Polls GET /replay and keeps live and replay data apart (see api/context.ts). */
export function ServerCtxProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const replayQuery = useQuery({
    queryKey: qk.replay,
    queryFn: ({ signal }) => api.replay(signal),
    refetchInterval: 2_000,
    // Monotonic: an answer the server generated earlier (a poll that raced a start/stop) never
    // replaces a newer one, so the screen can't flicker back to the old context.
    structuralSharing: (previous: unknown, next: unknown) => {
      const prev = previous as Envelope<Replay> | undefined
      const fresh = next as Envelope<Replay>
      return prev && Date.parse(prev.generated_at) > Date.parse(fresh.generated_at) ? prev : fresh
    },
  })

  const replay = replayQuery.data?.data ?? null
  const ctx: ServerCtx | null = replay ? ctxOf(replay) : null
  const [switching, setSwitching] = useState<ServerCtxValue['switching']>(null)
  const previous = useRef<ServerCtx | null>(null)

  useEffect(() => {
    const prev = previous.current
    previous.current = ctx
    if (!ctx || !prev || prev === ctx) return
    // Drop everything fetched under the old context so nothing from it can be shown again.
    queryClient.removeQueries({ predicate: (q) => belongsToCtx(q.queryKey, prev) })
    setSwitching(isReplayCtx(ctx) ? 'to-replay' : 'to-live')
    const timer = window.setTimeout(() => setSwitching(null), SWITCH_MS)
    return () => window.clearTimeout(timer)
  }, [ctx, queryClient])

  const value = useMemo<ServerCtxValue>(
    () => ({
      ctx,
      replay,
      replayEnvelope: replayQuery.data ?? null,
      switching,
      offline: replayQuery.isError,
    }),
    [ctx, replay, replayQuery.data, replayQuery.isError, switching],
  )
  return <ServerCtxContext.Provider value={value}>{children}</ServerCtxContext.Provider>
}
