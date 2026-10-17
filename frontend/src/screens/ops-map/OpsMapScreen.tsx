import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEMO_SITE_ID } from '../../api/config'
import type { SiteView } from '../../api/proposed'
import { useReports, useSites } from '../../api/queries'
import { EmptyBlock, ErrorBlock, LoadingBlock, StaleBanner } from '../../components/States'
import { VehicleSwitch } from '../../components/VehicleSwitch'
import { useNow } from '../../hooks/useNow'
import { rankSites } from '../../domain/ranking'
import { STALE_BUDGET_MS, isStale } from '../../domain/staleness'
import type { StatusKey } from '../../domain/status'
import { useDemoUi } from '../../state/demoUiContext'
import { MapLegend, SitePreview } from './MapOverlays'
import { SiteList } from './SiteList'
import type { ReportSummary } from './SiteList'
import { SiteMap } from './SiteMap'
import type { Basemap } from './SiteMap'
import { StatsStrip } from './StatsStrip'

/** Screen 1 (README §9): every site on a map and in a ranked list, with headline counts. */
export function OpsMapScreen() {
  const sitesQuery = useSites()
  const reportsQuery = useReports()
  const { vehicle } = useDemoUi()
  const now = useNow(1000)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [filter, setFilter] = useState<ReadonlySet<StatusKey>>(new Set())
  const [query, setQuery] = useState('')
  // OpenStreetMap tiles need the internet; the bundled outline basemap doesn't (README P14, §14.7).
  const [basemap, setBasemap] = useState<Basemap>(() => (navigator.onLine ? 'tiles' : 'offline'))
  useEffect(() => {
    const goOffline = () => setBasemap('offline')
    window.addEventListener('offline', goOffline)
    return () => window.removeEventListener('offline', goOffline)
  }, [])

  const sites = useMemo(() => sitesQuery.data?.data ?? [], [sitesQuery.data])
  const stale = isStale({ updatedAt: sitesQuery.dataUpdatedAt, now, budgetMs: STALE_BUDGET_MS.map, failed: sitesQuery.isError })
  // Stale data withholds every status rather than showing an old one (never a stale green).
  const statusOf = useCallback((site: SiteView): StatusKey => (stale ? 'STALE' : site.effective_status[vehicle]), [stale, vehicle])

  const ranked = useMemo(() => rankSites(sites.filter((s) => s.id !== DEMO_SITE_ID)), [sites])
  const rankOf = useMemo(() => new Map(ranked.map((s, i) => [s.id, i + 1])), [ranked])
  const demoTray = sites.find((s) => s.id === DEMO_SITE_ID) ?? null

  const counts = new Map<StatusKey, number>()
  for (const site of ranked) counts.set(statusOf(site), (counts.get(statusOf(site)) ?? 0) + 1)

  const needle = query.trim().toLowerCase()
  const rows = ranked.filter(
    (s) =>
      (filter.size === 0 || filter.has(statusOf(s))) &&
      (!needle || `${s.name} ${s.region ?? ''} ${s.id}`.toLowerCase().includes(needle)),
  )

  const reports = useMemo(() => {
    const bySite = new Map<string, ReportSummary>()
    for (const r of reportsQuery.data?.data ?? []) {
      // The list is newest first, so the first report seen per site is its latest.
      const entry = bySite.get(r.site_id)
      bySite.set(r.site_id, entry ? { ...entry, count: entry.count + 1 } : { count: 1, latestId: r.id })
    }
    return bySite
  }, [reportsQuery.data])

  // Report pins present at first load appear without animation; later ones drop in.
  // (Derived state set during render: React re-renders immediately, before anything is painted.)
  const [knownReportIds, setKnownReportIds] = useState<ReadonlySet<string> | null>(null)
  if (knownReportIds === null && reportsQuery.data) setKnownReportIds(new Set(reportsQuery.data.data.map((r) => r.id)))

  function toggleFilter(status: StatusKey | 'ALL') {
    if (status === 'ALL') return setFilter(new Set())
    const next = new Set(filter)
    if (next.has(status)) next.delete(status)
    else next.add(status)
    setFilter(next)
  }

  if (!sitesQuery.data && sitesQuery.isError) {
    return <ErrorBlock title="Sites are unavailable" error={sitesQuery.error} onRetry={() => void sitesQuery.refetch()} className="mx-auto max-w-3xl" />
  }

  const selected = sites.find((s) => s.id === selectedId) ?? null

  return (
    <div className="flex h-full min-h-[44rem] flex-col gap-4">
      <StatsStrip sites={sites} vehicle={vehicle} stale={stale} />
      {stale && <StaleBanner updatedAt={sitesQuery.dataUpdatedAt} what="Site data" />}
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(27rem,37%)_1fr]">
        {!sitesQuery.data ? (
          <LoadingBlock label="Loading sites" className="rounded-[4px] border border-line bg-panel" />
        ) : sites.length === 0 ? (
          <EmptyBlock title="No sites loaded" className="bg-panel">
            The backend returned no sites. Check that fixtures/sites_50.json is present (see /api/v1/health).
          </EmptyBlock>
        ) : (
          <SiteList
            rows={rows}
            rankOf={rankOf}
            demoTray={demoTray}
            vehicle={vehicle}
            statusOf={statusOf}
            counts={counts}
            filter={filter}
            onToggleFilter={toggleFilter}
            query={query}
            onQuery={setQuery}
            reports={reports}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={setSelectedId}
            onHover={setHoveredId}
            now={now}
            loading={sitesQuery.isLoading}
          />
        )}
        <div className="relative min-h-[30rem] overflow-hidden rounded-[4px] border border-line">
          <SiteMap
            basemap={basemap}
            onTilesFailing={() => setBasemap('offline')}
            sites={sites}
            listMode={sitesQuery.data?.mode}
            statusOf={statusOf}
            reports={reports}
            knownReportIds={knownReportIds ?? new Set()}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={setSelectedId}
            onHover={setHoveredId}
          />
          {/* Wide screens have the vehicle switch in the header; narrower ones get it on the map. */}
          <div className="absolute top-3 left-3 z-[1000] xl:hidden">
            <VehicleSwitch />
          </div>
          <div className="absolute top-[5.5rem] right-3 z-[1000] flex flex-col items-end gap-2">
            {basemap === 'offline' && (
              <span className="rounded-[3px] border border-dashed border-line-hi bg-panel/95 px-2.5 py-1 text-[0.75rem] text-muted label-caps">
                Offline basemap · map tiles unavailable
              </span>
            )}
            <button
              type="button"
              onClick={() => setBasemap(basemap === 'tiles' ? 'offline' : 'tiles')}
              className="rounded-[3px] border border-line-hi bg-panel/95 px-2.5 py-1.5 text-[0.75rem] text-ink label-caps hover:bg-steel-hi"
            >
              {basemap === 'tiles' ? 'Use offline basemap' : 'Try map tiles again'}
            </button>
          </div>
          <MapLegend vehicle={vehicle} />
          {selected && (
            <SitePreview
              site={selected}
              status={statusOf(selected)}
              stale={stale}
              reportCount={reports.get(selected.id)?.count ?? 0}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
