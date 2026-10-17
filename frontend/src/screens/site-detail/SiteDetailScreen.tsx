import { ArrowLeft, Camera, MapPin } from 'lucide-react'
import { Link } from 'wouter'
import { DEMO_SITE_ID } from '../../api/config'
import { ApiError } from '../../api/errors'
import { useLatestReading, usePolicies, useSite } from '../../api/queries'
import { Card } from '../../components/Card'
import { ReportCard } from '../../components/ReportCard'
import { ReportReview } from '../../components/ReportReview'
import { EmptyBlock, ErrorBlock, LoadingBlock, StaleBanner } from '../../components/States'
import { useNow } from '../../hooks/useNow'
import { ageSeconds, fmtAgo, fmtWhen } from '../../domain/format'
import { inputsSummary } from '../../domain/inputs'
import { MODE_LABEL } from '../../domain/provenance'
import { STALE_BUDGET_MS, isStale } from '../../domain/staleness'
import { useDemoUi } from '../../state/demoUiContext'
import { AccessCard } from './AccessCard'
import { EffectiveBanner } from './EffectiveBanner'
import { HazardCard } from './HazardCard'
import { MatsCostPanel } from './MatsCostPanel'
import { ProvenanceTable } from './ProvenanceTable'
import { SiteTimeline } from './SiteTimeline'
import { WhyThisCall } from './WhyThisCall'

/** Screen 2 (README §9): one site's weather hazard and per-vehicle access, side by side, with the evidence. */
export function SiteDetailScreen({ siteId }: { siteId: string }) {
  const { vehicle } = useDemoUi()
  const now = useNow(1000)
  const siteQuery = useSite(siteId)
  const policy = usePolicies().data?.data
  const isDemo = siteId === DEMO_SITE_ID
  const readingQuery = useLatestReading(undefined, isDemo)

  if (!siteQuery.data) {
    if (siteQuery.isError) {
      const notFound = siteQuery.error instanceof ApiError && siteQuery.error.status === 404
      return <ErrorBlock title={notFound ? `No site called ${siteId}` : 'Site unavailable'} error={siteQuery.error} onRetry={notFound ? undefined : () => void siteQuery.refetch()} className="mx-auto max-w-3xl" />
    }
    return <LoadingBlock label="Loading site" />
  }

  const env = siteQuery.data
  const site = env.data
  const stale = isStale({ updatedAt: siteQuery.dataUpdatedAt, now, budgetMs: STALE_BUDGET_MS.site, failed: siteQuery.isError })
  const reading = readingQuery.data?.data ?? null
  const readingAge = reading ? ageSeconds(reading.received_at, now) : null
  const readingFresh = readingAge !== null && readingAge <= (policy?.sensor_stale_seconds ?? 15)
  const inputs = inputsSummary(site)

  return (
    <div className="mx-auto flex max-w-[1680px] flex-col gap-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link href="/" className="flex items-center gap-1.5 text-[0.85rem] text-accent label-caps hover:underline">
            <ArrowLeft aria-hidden className="size-4" /> All sites
          </Link>
          <h1 className="font-display text-[2.6rem] leading-none font-bold tracking-wide uppercase">{site.name}</h1>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
            <span className="font-semibold text-ink">{site.id}</span>
            {site.region && <span>{site.region}</span>}
            <span className="flex items-center gap-1 num">
              <MapPin aria-hidden className="size-4" />
              {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
            </span>
            <span className="rounded-[3px] border border-line-hi px-2 py-0.5 text-[0.75rem] label-caps">{MODE_LABEL[site.mode ?? env.mode]}</span>
            <span title={fmtWhen(site.evaluated_at)}>Evaluated {fmtAgo(site.evaluated_at, now)}</span>
            {inputs.total > 0 && (
              <span className={inputs.have < inputs.total ? 'text-unknown' : undefined}>
                {inputs.have} of {inputs.total} inputs
              </span>
            )}
          </p>
        </div>
        <Link href={`/report/${site.id}`} className="flex min-h-12 items-center gap-2 rounded-[3px] border-2 border-ink px-4 font-semibold text-ink label-caps hover:bg-ink hover:text-bg">
          <Camera aria-hidden className="size-5" /> Report hazard
        </Link>
      </header>

      {stale && <StaleBanner updatedAt={siteQuery.dataUpdatedAt} what="This site" />}
      {(env.errors ?? []).map((e) => (
        <p key={e} className="rounded-[3px] border border-caution/60 bg-caution/10 px-4 py-2 text-caution">
          Data note: {e}
        </p>
      ))}

      <EffectiveBanner site={site} vehicle={vehicle} status={stale ? 'STALE' : site.effective_status[vehicle]} />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <HazardCard site={site} policy={policy} stale={stale} />
        <AccessCard site={site} vehicle={vehicle} policy={policy} reading={reading} now={now} stale={stale} />
      </div>

      <WhyThisCall site={site} vehicle={vehicle} policy={policy} reading={reading} readingFresh={readingFresh} />

      <MatsCostPanel site={site} vehicle={vehicle} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <ProvenanceTable site={site} />
        <div className="flex flex-col gap-5">
          <Card title={`Crew reports · ${site.reports.length}`} icon={<Camera aria-hidden className="size-4" />}>
            {site.reports.length === 0 ? (
              <EmptyBlock title="No crew reports for this site">
                <Link href={`/report/${site.id}`} className="text-accent underline underline-offset-4">
                  Report a hazard
                </Link>
              </EmptyBlock>
            ) : (
              <div className="flex flex-col gap-3">
                {site.reports.map((r) => (
                  <ReportCard key={r.id} report={r} now={now} actions={<ReportReview report={r} />} />
                ))}
              </div>
            )}
          </Card>
          <SiteTimeline siteId={site.id} />
        </div>
      </div>
    </div>
  )
}
