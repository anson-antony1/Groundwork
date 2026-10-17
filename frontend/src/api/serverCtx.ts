import { createContext, useContext } from 'react'
import type { ServerCtx } from './context'
import type { Envelope, Replay } from './types'

export interface ServerCtxValue {
  /** null until the first GET /replay answer; context-scoped queries wait for it. */
  ctx: ServerCtx | null
  replay: Replay | null
  replayEnvelope: Envelope<Replay> | null
  /** Set for a moment while the UI swaps between live and replay data. */
  switching: 'to-replay' | 'to-live' | null
  /** The /replay poll is failing: the API is probably unreachable. */
  offline: boolean
}

export const ServerCtxContext = createContext<ServerCtxValue | null>(null)

export function useServerCtx(): ServerCtxValue {
  const value = useContext(ServerCtxContext)
  if (!value) throw new Error('useServerCtx must be used inside ServerCtxProvider')
  return value
}
