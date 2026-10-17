import { FlagOff, Loader2 } from 'lucide-react'
import { hasEndpoint } from '../api/config'
import { describeError } from '../api/errors'
import { PROPOSED_ENDPOINTS } from '../api/proposed'
import { useClearCrewFlag } from '../api/queries'

/** Supervisor clears a crew flag raised with the beacon's long button press (weather is never touched). */
export function ClearCrewFlag() {
  const clear = useClearCrewFlag()
  if (!hasEndpoint(PROPOSED_ENDPOINTS.clearCrewFlag)) return null
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={clear.isPending}
        onClick={() => clear.mutate()}
        className="flex min-h-10 items-center gap-2 rounded-[3px] border-2 border-caution/80 px-3 text-[0.85rem] text-caution label-caps hover:bg-caution/10 disabled:opacity-50"
      >
        {clear.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FlagOff aria-hidden className="size-4" />}
        Clear crew flag
      </button>
      {clear.isError && <span className="text-[0.8rem] text-caution">Not cleared: {describeError(clear.error)}</span>}
    </span>
  )
}
