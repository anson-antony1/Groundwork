import { BellRing, ChevronDown, CloudSun, Hand, OctagonX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEMO_DEVICE_ID, DEMO_SITE_ID } from '../api/config'
import { describeError } from '../api/errors'
import { useDisplay, useReplayControl, useSites } from '../api/queries'
import { useServerCtx } from '../api/serverCtx'
import { fmtClock } from '../domain/format'
import { replayLabel } from '../domain/provenance'
import { cx } from './cx'

const TAKEOVER_MS = 5_000

/**
 * STOP WORK visually overrides everything (README P4, P15).
 * - When it covers the demo tray (where the beacon is) or every site (a storm replay): a full-screen
 *   takeover, collapsing after 5 s into a pinned bar plus a red frame, until the weather logic clears it.
 * - When it covers only some field sites: the pinned bar names them; their map markers and site pages
 *   show STOP WORK overriding access.
 * Acknowledging on the beacon silences the alarm; it never clears STOP WORK.
 */
export function StopWorkLayer() {
  const { ctx, replay } = useServerCtx()
  const sites = useSites().data?.data ?? []
  const stopSites = sites.filter((s) => s.weather_state === 'STOP_WORK')
  const stopIds = stopSites.map((s) => s.id)
  const active = stopIds.length > 0
  const total = stopIds.length === sites.length || stopIds.includes(DEMO_SITE_ID)
  const display = useDisplay(DEMO_DEVICE_ID, 2_000, total).data
  const { stop } = useReplayControl()

  const episode = total ? `${ctx}|${stopIds.join(',')}` : ''
  const [dismissed, setDismissed] = useState('')
  const [reopened, setReopened] = useState(false)
  const takeover = total && (episode !== dismissed || reopened)

  // Collapse to the bar on its own, so the map, the ack time and new crew pins stay visible.
  useEffect(() => {
    if (!total || episode === dismissed) return
    const timer = window.setTimeout(() => setDismissed(episode), TAKEOVER_MS)
    return () => window.clearTimeout(timer)
  }, [total, episode, dismissed])

  useEffect(() => {
    if (!takeover) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDismissed(episode)
        setReopened(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [takeover, episode])

  if (!active) return null

  const names = stopSites.slice(0, 3).map((s) => s.name).join(', ') + (stopSites.length > 3 ? ` and ${stopSites.length - 3} more` : '')
  const source = replay?.active ? replayLabel(replay.source) : total ? 'Active weather override from the backend' : names
  const started = replay?.active && replay.started_at ? ` · started ${fmtClock(replay.started_at)}` : ''
  const ack = display?.code === 'STOP' ? display.acknowledged_at : null
  const alarm = display?.code === 'STOP' && display.alarm
  const collapse = () => {
    setDismissed(episode)
    setReopened(false)
  }

  return (
    <>
      {/* Red frame around the whole screen while STOP WORK holds where the beacon is. */}
      {total && <div aria-hidden className="pointer-events-none fixed inset-0 z-[1500] border-[6px] border-stop shadow-[inset_0_0_42px_rgb(229_37_30/0.45)]" />}

      <div role="status" className="relative flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 overflow-hidden border-b-2 border-stop bg-[#3a1210] py-2.5 pr-5 pl-12">
        <span aria-hidden className="absolute inset-y-0 left-0 w-8 hazard-stripes" />
        <OctagonX aria-hidden className="size-8 text-stop-glow" strokeWidth={2.4} />
        <span className="font-display text-2xl font-bold tracking-wide text-ink uppercase">{total ? 'Stop work · all vehicles' : 'Stop work at some sites'}</span>
        <span className="text-ink">
          {stopIds.length} site{stopIds.length > 1 ? 's' : ''} · {source}
          {started}
        </span>
        <AckStatus ack={ack} alarm={alarm} />
        <span className="ml-auto flex gap-2">
          {total && (
            <button type="button" onClick={() => setReopened(true)} className="flex min-h-10 items-center gap-1.5 rounded-[3px] border border-ink/60 px-3 text-ink label-caps hover:bg-ink/10">
              <ChevronDown aria-hidden className="size-4" /> Details
            </button>
          )}
          {replay?.active && (
            <button
              type="button"
              disabled={stop.isPending}
              onClick={() => stop.mutate()}
              className="flex min-h-10 items-center gap-1.5 rounded-[3px] bg-accent px-3 text-accent-ink label-caps disabled:opacity-60"
            >
              <CloudSun aria-hidden className="size-4" /> {stop.isPending ? 'Exiting…' : 'Exit replay'}
            </button>
          )}
        </span>
        {stop.isError && <span className="w-full text-[0.85rem] text-ink">Couldn't exit replay: {describeError(stop.error)}</span>}
      </div>

      {takeover && (
        <div
          role="alert"
          aria-live="assertive"
          onClick={collapse}
          className="fixed inset-0 z-[1800] flex cursor-pointer flex-col items-center justify-center gap-6 bg-[#2a0b09]/95 px-8 text-center animate-sweep-in"
        >
          <span aria-hidden className="absolute inset-x-0 top-0 h-6 hazard-stripes" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-6 hazard-stripes" />
          <OctagonX aria-hidden className="size-36 text-stop-glow drop-shadow-[0_0_28px_rgb(255_77_66/0.7)]" strokeWidth={2.2} />
          <p className="font-display text-[clamp(4.5rem,11vw,10rem)] leading-none font-bold tracking-wider text-ink uppercase">Stop work</p>
          <p className="font-display text-3xl font-semibold tracking-wide text-ink uppercase">
            All vehicles · {stopIds.length} site{stopIds.length > 1 ? 's' : ''}
          </p>
          <p className="max-w-3xl text-xl text-ink/90">
            {source}
            {started}. Mats do not make severe weather safe. Only the weather logic can clear STOP WORK.
          </p>
          <AckStatus ack={ack} alarm={alarm} large />
          <p className="mt-4 text-[0.9rem] text-ink/70 label-caps">Click or press Esc to show the map · collapses automatically</p>
          {!reopened && <span aria-hidden className="absolute bottom-6 left-0 h-1.5 bg-stop-glow [animation:shrink_5s_linear_forwards]" />}
        </div>
      )}
    </>
  )
}

function AckStatus({ ack, alarm, large }: { ack: string | null; alarm: boolean; large?: boolean }) {
  if (ack) {
    return (
      <span className={cx('flex items-center gap-2 font-semibold text-caution', large && 'text-2xl')}>
        <Hand aria-hidden className={large ? 'size-7' : 'size-5'} />
        Acknowledged {fmtClock(ack)} · status remains STOP WORK
      </span>
    )
  }
  if (alarm) {
    return (
      <span className={cx('flex items-center gap-2 font-semibold text-ink', large && 'text-2xl')}>
        <BellRing aria-hidden className={cx('text-stop-glow', large ? 'size-7' : 'size-5')} />
        Beacon alarm sounding · tap the beacon to acknowledge
      </span>
    )
  }
  return null
}
