import { ArrowRight, Camera, Radio, Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'wouter'
import type { SiteView } from '../../api/proposed'
import type { Vehicle } from '../../api/types'
import { cx } from '../../components/cx'
import { MissingValue } from '../../components/Provenance'
import { StatusMarker } from '../../components/StatusMarker'
import { StatusTag, WeatherInline } from '../../components/StatusTag'
import { siteTagTransition } from '../../components/viewTransitionNav'
import { fmtAgo, fmtNum, fmtObservation } from '../../domain/format'
import { inputsSummary } from '../../domain/inputs'
import { LABELS } from '../../domain/provenance'
import { STATUS_ORDER, statusVisual } from '../../domain/status'
import type { StatusKey } from '../../domain/status'

export interface ReportSummary {
  count: number
  latestId: string
}

interface SiteListProps {
  rows: SiteView[]
  rankOf: Map<string, number>
  demoTray: SiteView | null
  vehicle: Vehicle
  statusOf: (site: SiteView) => StatusKey
  counts: Map<StatusKey, number>
  filter: ReadonlySet<StatusKey>
  onToggleFilter: (status: StatusKey | 'ALL') => void
  query: string
  onQuery: (q: string) => void
  reports: Map<string, ReportSummary>
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  now: number
  loading: boolean
}

function Hazard({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <MissingValue what="weather risk" className="text-[0.85rem]" />
  return (
    <span className="flex flex-col items-end">
      <span className="flex items-baseline gap-1">
        <span className="font-display text-[1.75rem] leading-none font-bold">{fmtNum(value)}</span>
        <span className="text-[0.8rem] text-muted">/10</span>
      </span>
      <span className="text-[0.68rem] text-muted label-caps" title="Weather only, 0 calm to 10 severe. The color is the overall call: soft ground can make a site amber or red even when this is low.">
        Weather risk
      </span>
    </span>
  )
}

function Inputs({ site }: { site: SiteView }) {
  const s = inputsSummary(site)
  if (s.total === 0) return null
  const missing = s.total - s.have
  return (
    <span className={cx('num', s.stale ? 'text-caution' : missing ? 'text-unknown' : 'text-muted')}>
      {missing ? `${missing} of ${s.total} inputs missing` : 'All data in'}
      {s.stale ? ' · old' : ''}
    </span>
  )
}

/** The one-line "why" for a flagged row, from the backend's own reasons; null when there's nothing to explain. */
function rowReason(site: SiteView, status: StatusKey): string | null {
  const reasons = site.reasons
  if (status === 'STOP_WORK' || status === 'SUPERVISOR_REVIEW') {
    const triggers = reasons?.weather_triggers ?? []
    const alert = triggers.find((t) => t.startsWith('NWS alert: '))
    if (alert) return `${alert.slice('NWS alert: '.length)} (Weather Service)`
    return triggers[0]?.replace(/ \(points from [^)]*\)$/, '') ?? null
  }
  if (status === 'MATS_FOR_REVIEW' || status === 'NO_GO_FOR_REVIEW') {
    // Name the week's rain, and the soil only when it drains poorly ("well drained" next to "soft" reads wrong).
    const rain = site.observations.find((o) => o.variable === 'rain_7d')
    const parts = ['Soft ground']
    if (rain && rain.value !== null) parts.push(`${fmtObservation(rain)} of rain in 7 days`)
    if (reasons?.soil_drainage?.includes('poorly')) parts.push(`${reasons.soil_drainage} soil`)
    return parts.join(' · ')
  }
  return null
}

function SiteRow({ site, rank, props }: { site: SiteView; rank: number; props: SiteListProps }) {
  const ref = useRef<HTMLLIElement>(null)
  const stale = props.statusOf(site) === 'STALE'
  const selected = props.selectedId === site.id
  const hovered = props.hoveredId === site.id
  const reports = props.reports.get(site.id)

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={() => props.onSelect(site.id)}
        onMouseEnter={() => props.onHover(site.id)}
        onMouseLeave={() => props.onHover(null)}
        aria-pressed={selected}
        className={cx(
          'grid w-full grid-cols-[2.2rem_1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-l-4 border-b-line/70 px-4 py-3 text-left transition-colors',
          selected ? 'border-l-accent bg-steel-hi' : hovered ? 'border-l-line-hi bg-steel' : 'border-l-transparent hover:bg-steel',
        )}
      >
        <span className="row-span-2 self-start pt-1 font-display text-lg font-semibold text-faint num">{rank}</span>
        <span className="flex min-w-0 items-center gap-3">
          <StatusTag status={props.statusOf(site)} compact pulseOnChange />
          <span className="truncate text-[1.05rem] font-semibold">{site.name}</span>
        </span>
        <span className={cx('row-span-2 justify-self-end', stale && 'opacity-40')}>
          <Hazard value={site.hazard_score} />
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[0.82rem] text-muted">
          {(!stale && rowReason(site, props.statusOf(site))) ? (
            <span className="text-ink">{rowReason(site, props.statusOf(site))}</span>
          ) : (
            <WeatherInline state={stale ? 'UNKNOWN' : site.weather_state} />
          )}
          <Inputs site={site} />
          <span>{fmtAgo(site.evaluated_at, props.now)}</span>
          {reports && (
            <span className="flex items-center gap-1 text-ink">
              <Camera aria-hidden className="size-3.5" />
              {reports.count} crew report{reports.count > 1 ? 's' : ''}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

function DemoTrayCallout({ site, props }: { site: SiteView; props: SiteListProps }) {
  const selected = props.selectedId === site.id
  return (
    <div
      className={cx(
        'flex flex-col gap-2.5 border-b-2 border-line px-4 py-3.5',
        selected ? 'bg-steel-hi' : 'bg-gradient-to-r from-accent/10 to-transparent',
      )}
      onMouseEnter={() => props.onHover(site.id)}
      onMouseLeave={() => props.onHover(null)}
    >
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => props.onSelect(site.id)} className="flex items-center gap-2 text-accent label-caps">
          <Radio aria-hidden className="size-5" />
          Demo tray · venue
        </button>
        <Link href="/demo-tray" transition className="flex items-center gap-1 text-[0.85rem] text-accent label-caps hover:underline">
          Open <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* While the tray is selected, the map preview's tag carries the morph name instead (names must be unique). */}
        <StatusTag status={props.statusOf(site)} size="lg" pulseOnChange viewTransitionName={selected ? undefined : siteTagTransition(site.id)} />
        <span className="rounded-[3px] border border-line-hi px-2 py-1 text-[0.75rem] text-muted label-caps">Beacon evaluates: Heavy truck</span>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 text-[0.8rem] text-muted">
        <span>
          {LABELS.demoSensor} · updated {fmtAgo(site.evaluated_at, props.now)}
        </span>
        {props.reports.get(site.id) && (
          <span className="flex items-center gap-1 text-ink">
            <Camera aria-hidden className="size-3.5" />
            {props.reports.get(site.id)!.count} crew report{props.reports.get(site.id)!.count > 1 ? 's' : ''} · unverified
          </span>
        )}
      </p>
    </div>
  )
}

export function SiteList(props: SiteListProps) {
  const { rows, filter, counts } = props
  return (
    <section aria-label="Ranked sites" className="flex h-[34rem] min-h-0 flex-col overflow-hidden rounded-[4px] border border-line bg-panel lg:h-auto">
      <header className="flex flex-col gap-3 border-b border-line bg-gradient-to-b from-steel-hi/50 to-transparent px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[0.95rem] label-caps">Ranked for tomorrow</h2>
          <label className="flex min-w-0 items-center gap-2 rounded-[3px] border border-line-hi bg-bg px-2.5 focus-within:border-accent">
            <Search aria-hidden className="size-4 text-muted" />
            <input
              value={props.query}
              onChange={(e) => props.onQuery(e.target.value)}
              placeholder="Search sites"
              aria-label="Search sites"
              className="h-9 w-40 bg-transparent text-[0.9rem] outline-none placeholder:text-faint"
            />
            {props.query && (
              <button type="button" aria-label="Clear search" onClick={() => props.onQuery('')}>
                <X aria-hidden className="size-4 text-muted" />
              </button>
            )}
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          <button
            type="button"
            aria-pressed={filter.size === 0}
            onClick={() => props.onToggleFilter('ALL')}
            className={cx(
              'min-h-9 rounded-[3px] border px-2.5 text-[0.78rem] label-caps',
              filter.size === 0 ? 'border-accent bg-accent text-accent-ink' : 'border-line-hi text-muted hover:text-ink',
            )}
          >
            All
          </button>
          {STATUS_ORDER.map((status) => {
            const on = filter.has(status)
            const n = counts.get(status) ?? 0
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                disabled={n === 0 && !on}
                onClick={() => props.onToggleFilter(status)}
                className={cx(
                  'flex min-h-9 items-center gap-1.5 rounded-[3px] border px-2 text-[0.78rem] label-caps disabled:opacity-40',
                  on ? 'border-accent bg-steel-hi text-ink' : 'border-line-hi text-muted hover:text-ink',
                )}
              >
                <StatusMarker status={status} size={16} />
                {statusVisual(status).short}
                <span className="num text-faint">{n}</span>
              </button>
            )
          })}
        </div>
      </header>

      {props.demoTray && <DemoTrayCallout site={props.demoTray} props={props} />}

      <ol className="min-h-0 flex-1 overflow-y-auto" aria-busy={props.loading}>
        {rows.map((site) => (
          <SiteRow key={site.id} site={site} rank={props.rankOf.get(site.id) ?? 0} props={props} />
        ))}
        {!props.loading && rows.length === 0 && (
          <li className="p-6 text-muted">No sites match. Clear the search or the status filter.</li>
        )}
      </ol>
    </section>
  )
}
