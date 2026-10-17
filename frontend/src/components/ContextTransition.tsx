import { Loader2 } from 'lucide-react'
import { useServerCtx } from '../api/serverCtx'

/** A short, explicit beat while the screen swaps between live and replay data, so the switch is visible. */
export function ContextTransition() {
  const { switching } = useServerCtx()
  if (!switching) return null
  return (
    <div role="status" className="pointer-events-none fixed top-28 left-1/2 z-[1700] -translate-x-1/2 animate-sweep-in">
      <span className="flex items-center gap-3 rounded-[4px] border-2 border-line-hi bg-panel px-5 py-3 text-lg shadow-[0_14px_34px_rgb(0_0_0/0.6)] label-caps">
        <Loader2 aria-hidden className="size-5 animate-spin text-accent" />
        {switching === 'to-replay' ? 'Switching to historical replay' : 'Restoring live data'}
      </span>
    </div>
  )
}
