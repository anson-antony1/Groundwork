import { CircleSlash, Layers, MapPin, OctagonX } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { DEMO_SITE_ID } from '../../api/config'
import type { SiteView } from '../../api/proposed'
import type { Vehicle } from '../../api/types'
import { cx } from '../../components/cx'
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
        <p className="font-display text-[2.6rem] leading-none font-bold">{value ?? '—'}</p>
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

/** KPI row: total sites, STOP WORK, mats review, data missing (README §9 Screen 1). */
export function StatsStrip({ sites, vehicle, stale }: { sites: SiteView[]; vehicle: Vehicle; stale: boolean }) {
  const loaded = sites.length > 0
  const fieldSites = sites.filter((s) => s.id !== DEMO_SITE_ID)
  // Counting the backend's statuses for display; the statuses themselves come from the API.
  const count = (pred: (s: SiteView) => boolean) => (loaded && !stale ? sites.filter(pred).length : null)
  const stop = count((s) => s.effective_status[vehicle] === 'STOP_WORK')
  const mats = count((s) => s.effective_status[vehicle] === 'MATS_FOR_REVIEW')
  const missing = loaded ? fieldSites.filter((s) => inputsSummary(s).missing.length > 0 || s.data_status !== 'available').length : null

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:gap-4">
      <Tile label="Sites" value={loaded ? sites.length : null} sub={`${fieldSites.length} field + demo tray`} icon={MapPin} />
      <Tile
        label="Stop work"
        value={stop}
        sub={stop ? 'All vehicles · weather override' : stale ? 'Waiting for fresh data' : 'No weather stoppages'}
        icon={OctagonX}
        alert={stop ? 'stop' : undefined}
      />
      <Tile label="Need mats review" value={mats} sub={`For ${VEHICLE_LABEL[vehicle]}`} icon={Layers} alert={mats ? 'caution' : undefined} />
      <Tile label="Data missing" value={missing} sub="Sites with gaps or stale inputs" icon={CircleSlash}>
        <Coverage fieldSites={fieldSites} />
      </Tile>
    </div>
  )
}
