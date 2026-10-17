import { Bot, Camera, CircleSlash, FileText, Loader2, OctagonX, Printer, RefreshCw, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { DEMO_SITE_ID } from '../../api/config'
import type { BriefingView } from '../../api/proposed'
import { useGenerateBriefing, useLatestBriefing, useSites } from '../../api/queries'
import { EmailBriefingButton } from './EmailBriefingButton'
import { Card } from '../../components/Card'
import { cx } from '../../components/cx'
import { MissingValue } from '../../components/Provenance'
import { ReportCard } from '../../components/ReportCard'
import { FlapCount } from '../../components/SplitFlap'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/States'
import { StatusTag, WeatherTag } from '../../components/StatusTag'
import { TypeOut } from '../../components/TypeOut'
import { useNow } from '../../hooks/useNow'
import { fieldLabel, fmtAgo, fmtNum, fmtShortClock, fmtWhen } from '../../domain/format'
import { sourceCoverage } from '../../domain/inputs'
import { LABELS, MODE_LABEL } from '../../domain/provenance'
import { SupervisorOnly } from '../../auth/AccountButton'
import { useCan } from '../../auth/session'
import { BuildSequence } from './BuildSequence'

/** The plan is for the day after it was generated. */
function planDay(generatedAt: string): string {
  const d = new Date(generatedAt)
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

/** `typeOut`: this plan was generated just now, so its text types itself in once. */
function Narrative({ brief, typeOut }: { brief: BriefingView; typeOut: boolean }) {
  const llm = brief.narrative_source === 'llm'
  const [showTemplate, setShowTemplate] = useState(false)
  const text = showTemplate && brief.deterministic_summary ? brief.deterministic_summary : brief.summary
  return (
    <Card
      title="Tomorrow’s plan"
      icon={<ScrollText aria-hidden className="size-4" />}
      right={
        <span className={cx('flex items-center gap-1.5 rounded-[3px] border px-2 py-1 text-[0.75rem] label-caps', llm && !showTemplate ? 'border-dashed border-accent/70 text-accent' : 'border-line-hi text-muted')}>
          {llm && !showTemplate ? <Bot aria-hidden className="size-4" /> : <FileText aria-hidden className="size-4" />}
          {llm && !showTemplate ? `${LABELS.llmBriefing} · Gemini` : 'Deterministic summary · no AI'}
        </span>
      }
      footer={
        llm
          ? 'Gemini only rewrites facts the backend computed; numbers it didn’t receive are rejected and the deterministic text is used instead.'
          : 'Built in Python from the same structured records. This is also the automatic fallback when Gemini is slow or unavailable.'
      }
    >
      {typeOut && !showTemplate ? (
        <TypeOut key={text} text={text} className="max-w-5xl text-[1.35rem] leading-relaxed" />
      ) : (
        <p className="max-w-5xl text-[1.35rem] leading-relaxed">{text}</p>
      )}
      {llm && brief.deterministic_summary && (
        <button type="button" onClick={() => setShowTemplate(!showTemplate)} className="mt-4 text-[0.85rem] text-accent label-caps hover:underline">
          {showTemplate ? 'Show the Gemini narrative' : 'Show the deterministic version'}
        </button>
      )}
    </Card>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'stop' | 'caution' | 'unknown' }) {
  return (
    <div className={cx('rounded-[4px] border px-4 py-3', tone === 'stop' && value > 0 ? 'border-stop bg-stop/15' : tone === 'caution' && value > 0 ? 'border-caution/70 bg-caution/10' : 'border-line bg-panel')}>
      <p className="text-[0.75rem] text-muted label-caps">{label}</p>
      <p className="font-display text-[2.4rem] leading-none font-bold">
        <FlapCount value={value} />
      </p>
    </div>
  )
}

/** Screen 5 (README §9, P11): the 6 PM plan, generated on demand from structured records. */
export function BriefingScreen() {
  const latest = useLatestBriefing()
  const generate = useGenerateBriefing()
  const { can } = useCan()
  const sites = useSites().data
  const now = useNow(5000)
  const envelope = latest.data
  const brief = envelope?.data[0]
  const names = new Map((sites?.data ?? []).map((s) => [s.id, s.name]))

  const gaps = new Map<string, string[]>()
  for (const note of brief?.missing_data_notes ?? []) for (const f of note.missing_fields) gaps.set(f, [...(gaps.get(f) ?? []), note.site_id])

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 pb-8 print:max-w-none">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-accent label-caps">6 PM briefing</p>
          <h1 className="font-display text-[2.8rem] leading-none font-bold tracking-wide uppercase">{brief ? `Plan for ${planDay(brief.generated_at)}` : 'Tomorrow’s plan'}</h1>
          <p className="mt-1 max-w-3xl text-muted print:hidden">
            Made every evening at 6 PM for tomorrow’s crews. Generate makes one now; Email sends it.
          </p>
          {brief && (
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
              <span title={fmtWhen(brief.generated_at)}>
                Generated {fmtShortClock(brief.generated_at)} ({fmtAgo(brief.generated_at, now)})
              </span>
              <span className={cx('rounded-[3px] border px-2 py-0.5 text-[0.75rem] label-caps', brief.mode === 'replay' ? 'border-stop text-stop-glow' : 'border-line-hi')}>
                {MODE_LABEL[brief.mode]}
              </span>
              {brief.mode === 'replay' && <span className="text-stop-glow">Generated during a historical storm replay</span>}
            </p>
          )}
        </div>
        <div className="flex gap-3 print:hidden">
          <EmailBriefingButton disabled={!brief} />
          {brief && (
            <button type="button" onClick={() => window.print()} className="flex min-h-12 items-center gap-2 rounded-[3px] border-2 border-line-hi px-4 label-caps hover:bg-steel-hi">
              <Printer aria-hidden className="size-5" /> Print
            </button>
          )}
          {can('generatePlan') ? (
            <button
              type="button"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
              className="flex min-h-14 items-center gap-2.5 rounded-[3px] bg-accent px-6 text-lg text-accent-ink label-caps disabled:opacity-60"
            >
              {generate.isPending ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <RefreshCw aria-hidden className="size-6" />}
              {generate.isPending ? 'Building the plan…' : brief ? 'Regenerate 6 PM plan' : 'Generate 6 PM plan'}
            </button>
          ) : (
            <SupervisorOnly what="generate a new plan" />
          )}
        </div>
      </header>

      {generate.isPending && <BuildSequence />}
      {generate.isError && <ErrorBlock title="Couldn’t generate a new plan" error={generate.error} onRetry={() => generate.mutate()} />}
      {latest.isLoading && <LoadingBlock label="Loading the latest plan" />}
      {latest.isError && !envelope && <ErrorBlock title="Briefings unavailable" error={latest.error} onRetry={() => void latest.refetch()} />}
      {envelope && !brief && !generate.isPending && (
        <EmptyBlock title="No plan generated yet" className="p-8 text-lg">
          {can('generatePlan') ? (
            <>
              Press <strong>Generate 6 PM plan</strong> to rank tomorrow’s sites from the current data.
            </>
          ) : (
            'A supervisor generates the 6 PM plan.'
          )}
        </EmptyBlock>
      )}

      {brief && (
        <>
          <Narrative brief={brief} typeOut={brief.id === generate.data?.data.id} />

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Top priority sites" value={brief.top_priority_sites.length} />
            <Stat label="Stop work" value={brief.stop_work_site_ids.length} tone="stop" />
            <Stat label="Sites with data gaps" value={brief.missing_data_notes.length} tone="unknown" />
            <Stat label="Crew reports to review" value={brief.crew_report_followups.length} tone="caution" />
          </div>

          {brief.stop_work_site_ids.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[4px] border-2 border-stop bg-stop/15 px-5 py-3">
              <OctagonX aria-hidden className="size-7 text-stop-glow" />
              <span className="font-display text-2xl font-bold uppercase">Stop work · all vehicles</span>
              <span className="text-ink">
                {brief.stop_work_site_ids
                  .slice(0, 6)
                  .map((id) => names.get(id) ?? id)
                  .join(', ')}
                {brief.stop_work_site_ids.length > 6 && ` and ${brief.stop_work_site_ids.length - 6} more`}
              </span>
            </div>
          )}

          <Card title="Priority sites · ranked" icon={<FileText aria-hidden className="size-4" />} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[0.75rem] text-muted label-caps">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 font-normal">#</th>
                    <th className="px-3 py-2.5 font-normal">Site</th>
                    <th className="px-3 py-2.5 font-normal">Weather</th>
                    <th className="px-3 py-2.5 font-normal">Hazard</th>
                    <th className="px-3 py-2.5 font-normal">Pickup</th>
                    <th className="px-4 py-2.5 font-normal">Heavy truck</th>
                  </tr>
                </thead>
                <tbody>
                  {brief.top_priority_sites.map((s, i) => (
                    <tr key={s.id} className="border-b border-line/60">
                      <td className="px-4 py-3 font-display text-xl font-semibold text-faint num">{i + 1}</td>
                      <td className="px-3 py-3">
                        <Link href={`/sites/${s.id}`} className="text-lg font-semibold hover:text-accent hover:underline">
                          {s.name}
                        </Link>
                        <span className="block text-[0.8rem] text-muted">{s.id}</span>
                      </td>
                      <td className="px-3 py-3">
                        <WeatherTag state={s.weather_state} size="sm" />
                      </td>
                      <td className="px-3 py-3 font-display text-xl font-bold">{s.hazard_score === null ? <MissingValue what="hazard score" className="font-sans text-base font-normal" /> : fmtNum(s.hazard_score)}</td>
                      <td className="px-3 py-3">
                        <StatusTag status={s.effective_status.pickup} compact size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <StatusTag status={s.effective_status.heavy_truck} compact size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Card title="Data gaps" icon={<CircleSlash aria-hidden className="size-4" />} footer="Missing inputs are never treated as low risk.">
              {gaps.size === 0 ? (
                <EmptyBlock title="No data gaps reported" />
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {[...gaps.entries()]
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([field, ids]) => (
                      <li key={field} className="flex flex-col gap-0.5 border-b border-line/60 pb-2.5">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-lg font-semibold">{fieldLabel(field)}</span>
                          <span className="text-unknown">
                            missing at {ids.length} site{ids.length > 1 ? 's' : ''}
                          </span>
                        </span>
                        <span className="text-[0.82rem] text-muted">
                          {ids
                            .slice(0, 5)
                            .map((id) => names.get(id) ?? id)
                            .join(', ')}
                          {ids.length > 5 && ` and ${ids.length - 5} more`}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            <Card title="Sources" icon={<FileText aria-hidden className="size-4" />}>
              <ul className="flex flex-col gap-2">
                {sourceCoverage((sites?.data ?? []).filter((s) => s.id !== DEMO_SITE_ID)).map((c) => (
                  <li key={c.label} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5">
                    <span>{c.label}</span>
                    <span className={cx('text-[0.85rem]', c.have < c.total ? 'text-unknown' : 'text-muted')}>
                      {c.have} of {c.total} sites{c.fetchedAt && ` · ${fmtWhen(c.fetchedAt)}`}
                    </span>
                  </li>
                ))}
                {[...new Set([...(envelope?.sources ?? []), ...(brief.sources ?? [])])].map((s) => (
                  <li key={s} className="flex items-center gap-2 text-[0.9rem]">
                    <span className="size-1.5 rounded-full bg-muted" /> {s}
                  </li>
                ))}
                <li className="pt-1 text-[0.85rem] text-muted">Demo tray: {LABELS.demoSensor}</li>
              </ul>
            </Card>
          </div>

          <Card title={`Crew reports to follow up · ${brief.crew_report_followups.length}`} icon={<Camera aria-hidden className="size-4" />}>
            {brief.crew_report_followups.length === 0 ? (
              <EmptyBlock title="No unreviewed crew reports" />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {brief.crew_report_followups.map((r) => (
                  <ReportCard key={r.id} report={r} now={now} />
                ))}
              </div>
            )}
          </Card>
          <p className="text-muted print:hidden">
            Questions about a site? Ask Claude: it reads the same Groundwork data through our connector (MCP server), so it can explain any site’s call.
          </p>
        </>
      )}
    </div>
  )
}
