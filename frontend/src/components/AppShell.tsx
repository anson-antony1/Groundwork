import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { API_MODE } from '../api/config'
import { fmtClock } from '../domain/format'
import { LABELS } from '../domain/provenance'
import { useHotkeys } from '../hooks/useHotkeys'
import { useNow } from '../hooks/useNow'
import { useDemoUi } from '../state/demoUiContext'
import { cx } from './cx'
import { Wordmark } from './Logo'
import { NAV } from './nav'
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
  const mock = API_MODE === 'mock'
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-2 rounded-[3px] border-2 px-2 py-1 text-[0.72rem] whitespace-nowrap label-caps sm:px-2.5 sm:py-1.5 sm:text-[0.78rem]',
        mock ? 'border-dashed border-line-hi text-muted' : 'border-line-hi text-ink',
      )}
      title={mock ? 'Serving the in-browser demo fixture (VITE_API_MODE=mock)' : 'Connected to the backend (VITE_API_MODE=live)'}
    >
      <span aria-hidden className={cx('size-2.5 rounded-full', mock ? 'bg-muted' : 'bg-accent')} />
      {mock ? 'Mock API' : 'Live API'}
    </span>
  )
}

function TopBar({ compact }: { compact: boolean }) {
  const [location] = useLocation()
  return (
    <header className="sticky top-0 z-[1000] border-b-2 border-line bg-gradient-to-b from-[#20262d] to-[#171b20] shadow-[0_6px_18px_rgb(0_0_0/0.45)]">
      <div className="flex h-[4.25rem] items-stretch gap-3 px-3 sm:px-5 xl:gap-4">
        <Link href="/" className="flex min-w-0 items-center pr-1" aria-label="Groundwork home">
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
function DemoBanner() {
  const mock = API_MODE === 'mock'
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line bg-steel px-5 py-2 text-[0.85rem]">
      <span className="rounded-[2px] bg-ink px-2 py-0.5 text-[0.8rem] text-bg label-caps">Demo mode</span>
      {mock ? (
        <span className="font-semibold text-ink">{LABELS.demoFixture}: statuses are invented to exercise every state</span>
      ) : (
        <span className="text-ink">Hackathon prototype · not certified safety guidance</span>
      )}
      <span className="text-muted">Demo tray: {LABELS.demoSensor}</span>
      <span className="text-muted">Rules: {LABELS.prototypePolicy}</span>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation()
  const { vehicle, setVehicle } = useDemoUi()
  const phone = location.startsWith('/report')

  useHotkeys({
    ...Object.fromEntries(NAV.map((n) => [n.key, () => navigate(n.to)])),
    v: () => setVehicle(vehicle === 'pickup' ? 'heavy_truck' : 'pickup'),
  })

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar compact={phone} />
      <DemoBanner />
      <main className={cx('flex-1', phone ? 'mx-auto w-full max-w-xl px-4 py-5' : 'px-6 py-6')}>{children}</main>
    </div>
  )
}
