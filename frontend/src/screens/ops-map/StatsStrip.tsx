import { CircleSlash, Layers, MapPin, OctagonX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { DEMO_SITE_ID } from '../../api/config'
import type { SiteView } from '../../api/proposed'
import type { Vehicle } from '../../api/types'
import { cx } from '../../components/cx'
import { FlapCount } from '../../components/SplitFlap'
import { VEHICLE_LABEL, fmtWhen } from '../../domain/format'
import { inputsSummary, sourceCoverage } from '../../domain/inputs'

interface TileProps {
  label: string
  value: number | null
  sub: ReactNode
  icon: LucideIcon
  /** Tinted only when the count calls for attention. */
  alert?: 'stop' | 'caution'
  children?: ReactNode
}

function Tile({ label, value, sub, icon: Icon, alert, children }: TileProps) {
  return (
    <div
      className={cx(
        'relative flex min-w-0 items-center gap-3.5 rounded-[4px] border px-4 py-3 xl:gap-4 xl:px-5',
        alert === 'stop' ? 'border-stop bg-stop/15' : alert === 'caution' ? 'border-caution/70 bg-caution/10' : 'border-line bg-panel',
      )}
    >
      <Icon
        aria-hidden
        className={cx('size-8 shrink-0 xl:size-9', alert === 'stop' ? 'text-stop-glow' : alert === 'caution' ? 'text-caution' : 'text-muted')}
        strokeWidth={2.2}
      />
      <div className="min-w-0">
        <p className="text-[0.78rem] text-muted label-caps">{label}</p>
        <p className="font-display text-[2.6rem] leading-none font-bold">{value === null ? '—' : <FlapCount value={value} />}</p>
        <p className="mt-1 text-[0.82rem] leading-snug text-muted">{sub}</p>
        {children}
      </div>
    </div>
  )
}

/** Where each data source stands, counted from the observations each site actually has. */
function Coverage({ fieldSites }: { fieldSites: SiteView[] }) {
  return (
    <details className="relative mt-1.5">
      <summary className="inline-block cursor-pointer list-none text-[0.75rem] text-accent label-caps hover:underline">
        Data coverage ▾
      </summary>
      <div className="absolute left-0 z-[1100] mt-2 w-80 rounded-[4px] border border-line-hi bg-panel p-4 shadow-[0_14px_32px_rgb(0_0_0/0.55)]">
        <p className="mb-2 text-[0.78rem] text-muted label-caps">Data coverage · field sites</p>
        <dl className="flex flex-col gap-2 text-[0.88rem]">
          {sourceCoverage(fieldSites).map((c) => (
            <div key={c.label}>
              <dt className="font-semibold">{c.label}</dt>
              <dd className={c.have < c.total ? 'text-unknown' : 'text-muted'}>
                {c.have} of {c.total} sites{c.fetchedAt && ` · fetched ${fmtWhen(c.fetchedAt)}`}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[0.78rem] text-muted">Missing inputs never count as low risk.</p>
      </div>
    </details>
  )
}

/** What every call is based on, in plain words, for anyone asking "where do these come from?". */
function HowWeDecide() {
  return (
    <details className="relative">
      <summary className="inline-block cursor-pointer list-none text-[0.8rem] text-accent label-caps hover:underline">How we decide ▾</summary>
      <div className="absolute right-0 z-[1100] mt-2 w-[26rem] rounded-[4px] border border-line-hi bg-panel p-4 text-[0.88rem] shadow-[0_14px_32px_rgb(0_0_0/0.55)]">
        <dl className="flex flex-col gap-2.5">
          <div>
            <dt className="font-semibold">Weather · every vehicle</dt>
            <dd className="text-muted">
              Tomorrow's rain, wind gusts and feels-like heat (Open-Meteo), plus Weather Service alerts. A thunderstorm, tornado, hurricane, flash-flood or
              lightning warning means STOP WORK. The score /10 is this weather risk only: 0 calm, 10 severe.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Ground · each vehicle</dt>
            <dd className="text-muted">
              The last 7 days of rain, tomorrow's rain and how well the soil drains (USDA soil survey). Heavier vehicles need firmer ground. Ground is judged
              separately from the weather score, so a site with calm weather can still need mats or be NO-GO.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Also</dt>
            <dd className="text-muted">Wildfires within 10 miles (NIFC) and crew lightning reports within 10 miles.</dd>
          </div>
        </dl>
        <p className="mt-3 text-[0.78rem] text-muted">Missing data never counts as safe. A supervisor makes the final call.</p>
      </div>
    </details>
  )
}

function tomorrowLabel(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** KPI row: total sites, STOP WORK, mats, data missing (README §9 Screen 1). */
export function StatsStrip({ sites, vehicle, stale }: { sites: SiteView[]; vehicle: Vehicle; stale: boolean }) {
  const loaded = sites.length > 0
  const fieldSites = sites.filter((s) => s.id !== DEMO_SITE_ID)
  // Counting the backend's statuses for display; the statuses themselves come from the API.
  const count = (pred: (s: SiteView) => boolean) => (loaded && !stale ? sites.filter(pred).length : null)
  const stop = count((s) => s.effective_status[vehicle] === 'STOP_WORK')
  const mats = count((s) => s.effective_status[vehicle] === 'MATS_FOR_REVIEW')
  const missing = loaded ? fieldSites.filter((s) => inputsSummary(s).missing.length > 0 || s.data_status !== 'available').length : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.95rem] font-semibold label-caps">
          Plan for tomorrow · {tomorrowLabel()} · <span className="text-accent">{VEHICLE_LABEL[vehicle]}</span>
        </p>
        <HowWeDecide />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:gap-4">
        <Tile label="Sites" value={loaded ? sites.length : null} sub={`${fieldSites.length} field sites + demo tray`} icon={MapPin} />
        <Tile
          label="Stop work tomorrow"
          value={stop}
          sub={stop ? 'Dangerous weather · every vehicle' : stale ? 'Waiting for fresh data' : 'No dangerous weather forecast'}
          icon={OctagonX}
          alert={stop ? 'stop' : undefined}
        />
        <Tile label="Need mats tomorrow" value={mats} sub={`Soft ground for a ${VEHICLE_LABEL[vehicle].toLowerCase()}`} icon={Layers} alert={mats ? 'caution' : undefined} />
        <Tile label="Missing data" value={missing} sub="Never shown as safe" icon={CircleSlash}>
          <Coverage fieldSites={fieldSites} />
        </Tile>
      </div>
    </div>
  )
}
