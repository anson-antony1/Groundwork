import { CloudRain, Siren } from 'lucide-react'
import type { SiteDetailView } from '../../api/proposed'
import type { Policy } from '../../api/types'
import { Card } from '../../components/Card'
import { fieldIcon } from '../../components/fieldIcons'
import { MissingValue, ProvenanceLine, QualityChip } from '../../components/Provenance'
import { WeatherTag } from '../../components/StatusTag'
import { DEMO_SITE_ID } from '../../api/config'
import { fieldLabel, fmtNum, fmtValue, fmtWhen } from '../../domain/format'
import { LABELS, observationLabel } from '../../domain/provenance'

const SUBSCORES = ['rain', 'wind', 'heat', 'flood', 'storm'] as const

/**
 * Weather safety, for every vehicle (README §3A). Takes no vehicle on purpose:
 * switching vehicles can never change what this card shows.
 */
export function HazardCard({ site, policy, stale }: { site: SiteDetailView; policy: Policy | undefined; stale: boolean }) {
  const isDemo = site.id === DEMO_SITE_ID
  const score = site.hazard_score
  const hasScore = typeof score === 'number'
  const firstObservation = site.observations[0]

  return (
    <Card
      title="Weather hazard · all vehicles"
      icon={<CloudRain aria-hidden className="size-4" />}
      right={<WeatherTag state={stale ? 'UNKNOWN' : site.weather_state} size="md" emphasize={site.weather_state === 'STOP_WORK'} />}
      footer={
        <ProvenanceLine>
          {firstObservation ? observationLabel(firstObservation) : isDemo ? 'Demo tray: no weather feed; it runs a calm-weather demo scenario' : 'No weather inputs received'}
          {' · '}
          {LABELS.prototypePolicy}
        </ProvenanceLine>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="flex items-end gap-2">
            {hasScore ? (
              <>
                <span className="font-display text-[5.5rem] leading-[0.82] font-bold">{fmtNum(score)}</span>
                <span className="pb-1.5 text-2xl text-muted">/ 10</span>
              </>
            ) : (
              <span className="font-display text-4xl font-bold">
                <MissingValue what="hazard score" />
              </span>
            )}
          </div>
          <p className="max-w-xs pb-1 text-[0.85rem] text-muted">
            {isDemo && !hasScore
              ? 'No hazard score: the demo tray has no weather feed and runs a calm-weather demo scenario.'
              : "Rules-based 0–10 composite. Doesn't change with the vehicle. An active alert overrides it; it can't be averaged away."}
          </p>
        </div>

        {/* Neutral ink: the score explains; only the weather state carries status color. */}
        <div className={hasScore ? 'h-3 rounded-full bg-steel' : 'h-3 rounded-full border-2 border-dashed border-line-hi'}>
          {hasScore && <div className="h-full rounded-full bg-ink/85" style={{ width: `${Math.min(100, Math.max(0, score * 10))}%` }} />}
        </div>

        {site.hazard_subscores ? (
          <dl className="grid grid-cols-5 gap-3">
            {SUBSCORES.map((k) => {
              const value = site.hazard_subscores?.[k] ?? null
              return (
                <div key={k} className="flex flex-col gap-1.5">
                  <dt className="text-[0.75rem] text-muted label-caps">
                    {k}
                    {policy && <span className="text-faint"> · {Math.round(policy.hazard_weights[k] * 100)}%</span>}
                  </dt>
                  <dd className="font-display text-2xl font-bold">{value === null ? <MissingValue what={`${k} sub-score`} /> : fmtNum(value)}</dd>
                  <div className="h-1.5 rounded-full bg-steel">
                    {value !== null && <div className="h-full rounded-full bg-ink/70" style={{ width: `${value * 10}%` }} />}
                  </div>
                </div>
              )
            })}
          </dl>
        ) : (
          !isDemo && <p className="text-[0.85rem] text-muted">Sub-scores (rain, wind, heat, flood, storm) aren't provided by the API yet.</p>
        )}

        {(site.alerts?.length ?? 0) > 0 ? (
          <ul className="flex flex-col gap-2">
            {site.alerts!.map((a) => (
              <li key={`${a.event}-${a.onset ?? ''}`} className="flex items-start gap-2.5 rounded-[3px] border border-stop/70 bg-stop/10 px-3 py-2">
                <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-stop-glow" />
                <span>
                  <span className="font-semibold">{a.event}</span>
                  <span className="block text-[0.82rem] text-muted">
                    {a.source}
                    {a.onset && ` · ${fmtWhen(a.onset)}`}
                    {a.expires && ` → ${fmtWhen(a.expires)}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          site.missing_fields.includes('nws_alerts') && (
            <p className="flex items-center gap-2 text-[0.9rem]">
              <Siren aria-hidden className="size-4 text-muted" /> NWS alerts: <MissingValue what="NWS alerts" />
              <span className="text-muted">not connected, so the site can't be called safe</span>
            </p>
          )
        )}

        {site.observations.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {site.observations.map((o) => {
              const Icon = fieldIcon(o.variable)
              return (
                <div key={o.variable} className="flex items-center justify-between gap-3 border-b border-line/70 pb-2" title={observationLabel(o)}>
                  <dt className="flex items-center gap-2 text-muted">
                    <Icon aria-hidden className="size-4" />
                    {fieldLabel(o.variable)}
                  </dt>
                  <dd className="flex items-center gap-2 font-semibold">
                    {o.value === null ? <MissingValue what={fieldLabel(o.variable)} /> : fmtValue(o.value, o.unit)}
                    {o.quality !== 'available' && <QualityChip quality={o.quality} />}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}
      </div>
    </Card>
  )
}
