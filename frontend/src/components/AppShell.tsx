import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { API_MODE } from '../api/config'
import { useSites } from '../api/queries'
import { useServerCtx } from '../api/serverCtx'
import { fmtClock } from '../domain/format'
import { LABELS, MODE_LABEL, replayLabel, shortReplaySource } from '../domain/provenance'
import { isTypingTarget, useHotkeys } from '../hooks/useHotkeys'
import { useLongPress } from '../hooks/useLongPress'
import { useNow } from '../hooks/useNow'
import { setAmbient, useAmbient } from '../state/ambient'
import { useDemoUi } from '../state/demoUiContext'
import { MOCK_CONTROLS_EVENT } from '../state/mockEvents'
import { ContextTransition } from './ContextTransition'
import { HotkeyHelp } from './HotkeyHelp'
import { cx } from './cx'
import { Wordmark } from './Logo'
import { NAV } from './nav'
import { ResetDialog } from './ResetDialog'
import { StopWorkLayer } from './StopWorkLayer'
import { VehicleSwitch } from './VehicleSwitch'

function isActive(location: string, to: string): boolean {
  return to === '/' ? location === '/' : location.startsWith(to)
}

function Clock() {
  const now = useNow(1000)
  return (
    <span className="hidden flex-col items-end leading-none xl:flex">
      <span className="text-[0.66rem] text-faint label-caps">Local</span>
      <span className="font-display text-xl font-semibold num">{fmtClock(new Date(now).toISOString())}</span>
    </span>
  )
}

function ApiBadge() {
  const { offline } = useServerCtx()
  const mock = API_MODE === 'mock'
  const label = offline ? 'API offline' : mock ? 'Mock API' : 'Live API'
  return (
    <span
      role="status"
      className={cx(
        'inline-flex shrink-0 items-center gap-2 rounded-[3px] border-2 px-2 py-1 text-[0.72rem] whitespace-nowrap label-caps sm:px-2.5 sm:py-1.5 sm:text-[0.78rem]',
        offline || mock ? 'border-dashed border-line-hi text-muted' : 'border-line-hi text-ink',
      )}
      title={offline ? 'The API is not answering: statuses are withheld until it does' : mock ? 'Serving the in-browser demo fixture (VITE_API_MODE=mock)' : 'Connected to the backend (VITE_API_MODE=live)'}
    >
      <span aria-hidden className={cx('size-2.5 rounded-full', offline ? 'border border-unknown' : mock ? 'bg-muted' : 'bg-accent')} />
      {label}
    </span>
  )
}

function TopBar({ compact, onReset }: { compact: boolean; onReset: () => void }) {
  const [location] = useLocation()
  const hold = useLongPress(onReset, 2000)
  return (
    <header className="relative z-[1100] shrink-0 print:hidden border-b-2 border-line bg-gradient-to-b from-[#20262d] to-[#171b20] shadow-[0_6px_18px_rgb(0_0_0/0.45)]">
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="gw-scanline" />
      </span>
      <div className="flex h-[4.25rem] items-stretch gap-3 px-3 sm:px-5 xl:gap-4">
        <Link href="/" className="flex min-w-0 items-center pr-1" aria-label="Groundwork home" {...hold}>
          <Wordmark />
        </Link>
        {!compact && (
          <nav aria-label="Screens" className="flex min-w-0 items-stretch overflow-x-auto">
            {NAV.map((item) => {
              const active = isActive(location, item.to)
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-2 border-x border-b-[3px] border-x-transparent px-2.5 text-[0.95rem] whitespace-nowrap label-caps transition-colors xl:px-4',
                    active ? 'border-b-accent bg-steel-hi/70 text-ink' : 'border-b-transparent text-muted hover:bg-steel/80 hover:text-ink',
                  )}
                >
                  <kbd className="hidden rounded-[2px] border border-line-hi px-1.5 font-display text-[0.7rem] leading-4 text-faint 2xl:inline">
                    {item.key}
                  </kbd>
                  {item.label}
                </Link>
              )
            })}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-4">
          {/* Narrower screens get the switch inside the map and site screens instead. */}
          {!compact && (
            <div className="hidden xl:block">
              <VehicleSwitch />
            </div>
          )}
          <ApiBadge />
          <Clock />
        </div>
      </div>
    </header>
  )
}

/** Always-visible honesty strip: what kind of data is on screen (README §14, §15). */
function DemoBanner({ compact }: { compact: boolean }) {
  const { replay, offline } = useServerCtx()
  const sitesMode = useSites().data?.mode
  const mock = API_MODE === 'mock'
  if (compact) {
    // Phone: one line, so the crew form starts on the first screen.
    return (
      <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-steel px-4 py-1.5 text-[0.8rem]">
        <span className="rounded-[2px] bg-ink px-1.5 py-0.5 text-[0.72rem] text-bg label-caps">Demo mode</span>
        <span className="truncate text-ink">
          {offline ? 'API unreachable' : replay?.active ? 'Historical replay' : mock ? LABELS.demoFixture : 'Prototype · not certified safety guidance'}
        </span>
      </div>
    )
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line bg-steel px-5 py-2 text-[0.85rem]">
      <span className="rounded-[2px] bg-ink px-2 py-0.5 text-[0.8rem] text-bg label-caps">Demo mode</span>
      {mock ? (
        <>
          <span className="font-semibold text-ink">{LABELS.demoFixture}: statuses are invented to exercise every state</span>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(MOCK_CONTROLS_EVENT))}
            className="rounded-[3px] border border-dashed border-line-hi px-2 py-0.5 text-[0.75rem] text-muted label-caps hover:text-ink"
          >
            Rehearsal controls · Shift+M
          </button>
        </>
      ) : (
        <span className="text-ink">Hackathon prototype · not certified safety guidance</span>
      )}
      {replay?.active ? (
        <span className="font-semibold text-ink" title={replay.source ?? undefined}>
          {replayLabel(shortReplaySource(replay.source))}
          {replay.started_at && ` · started ${fmtClock(replay.started_at)}`}
        </span>
      ) : (
        sitesMode && <span className="text-muted">Field sites: {MODE_LABEL[sitesMode]}</span>
      )}
      <span className="text-muted">Demo tray: {LABELS.demoSensor}</span>
      <span className="text-muted">Rules: {LABELS.prototypePolicy}</span>
      {offline && <span className="rounded-[3px] border border-dashed border-unknown px-2 py-0.5 text-unknown label-caps">API unreachable · statuses withheld</span>}
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation()
  const { vehicle, setVehicle } = useDemoUi()
  const phone = location.startsWith('/report')
  const [resetOpen, setResetOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const ambient = useAmbient()
  const [ambientNote, setAmbientNote] = useState<string | null>(null)

  useHotkeys({
    ...Object.fromEntries(NAV.map((n) => [n.key, () => navigate(n.to)])),
    v: () => setVehicle(vehicle === 'pickup' ? 'heavy_truck' : 'pickup'),
    a: () => {
      setAmbient(!ambient)
      setAmbientNote(ambient ? 'Ambient motion off' : 'Ambient motion on')
    },
    '?': () => setHelpOpen((o) => !o),
  })

  useEffect(() => {
    if (!ambientNote) return
    const timer = window.setTimeout(() => setAmbientNote(null), 1600)
    return () => window.clearTimeout(timer)
  }, [ambientNote])

  // Hidden reset: Shift+Alt+R. Matched on e.code because Alt changes e.key on macOS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyR' && e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        setResetOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    // Full-height shell: header and banner stay put, only <main> scrolls, so the map can fill the rest.
    <div className="flex h-dvh flex-col print:block print:h-auto">
      <TopBar compact={phone} onReset={() => setResetOpen(true)} />
      <DemoBanner compact={phone} />
      <StopWorkLayer compact={phone} />
      <ContextTransition />
      <main className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
        <div className={cx('h-full', phone ? 'mx-auto w-full max-w-xl px-4 py-5' : 'px-6 py-5')}>{children}</div>
      </main>
      {ambientNote && (
        <p role="status" className="fixed bottom-4 left-1/2 z-[1700] -translate-x-1/2 rounded-[3px] border border-line-hi bg-steel-hi px-4 py-2.5 text-[0.85rem] label-caps">
          {ambientNote} · press A to switch
        </p>
      )}
      <ResetDialog open={resetOpen} onClose={() => setResetOpen(false)} />
      <HotkeyHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
