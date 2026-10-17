import { CloudRain, ListTree, Siren } from 'lucide-react'
import { createElement } from 'react'
import { DEMO_SITE_ID } from '../../api/config'
import type { SiteDetailView } from '../../api/proposed'
import { Card } from '../../components/Card'
import { fieldIcon } from '../../components/fieldIcons'
import { MissingValue, ProvenanceLine, QualityChip } from '../../components/Provenance'
import { WeatherTag } from '../../components/StatusTag'
import { fieldLabel, fmtNum, fmtObservation, fmtWhen } from '../../domain/format'
import { LABELS, observationLabel } from '../../domain/provenance'

/** Inputs to the weather decision. Soil observations belong to ground access, not here. */
const WEATHER_VARS = ['rain_7d', 'rain_forecast', 'gust_forecast', 'apparent_temp']
const SUBSCORES = ['rain', 'wind', 'heat', 'flood', 'storm'] as const

/**
 * Weather safety, for every vehicle (README §3A). Takes no vehicle on purpose:
 * switching vehicles can never change what this card shows.
 */
export function HazardCard({ site, stale }: { site: SiteDetailView; stale: boolean }) {
  const isDemo = site.id === DEMO_SITE_ID
  const score = site.hazard_score
  const hasScore = typeof score === 'number'
  const weatherObs = site.observations.filter((o) => WEATHER_VARS.includes(o.variable))
  const nws = site.observations.find((o) => o.variable === 'nws_alerts')
  const alerts = site.alert_events ?? []
  const explanation = site.hazard_explanation ?? []

  return (
    <Card
      title="Weather hazard · all vehicles"
      icon={<CloudRain aria-hidden className="size-4" />}
      right={<WeatherTag state={stale ? 'UNKNOWN' : site.weather_state} size="md" emphasize={site.weather_state === 'STOP_WORK'} />}
      footer={
        <ProvenanceLine>
          {weatherObs[0] ? observationLabel(weatherObs[0]) : isDemo ? 'Demo tray: no weather feed; it runs a calm-weather demo scenario' : 'No weather inputs received'}
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
              : "Rules-based 0–10 composite. Doesn't change with the vehicle. A severe-weather alert overrides it; it can't be averaged away."}
          </p>
        </div>

        {/* Neutral ink: the score explains; only the weather state carries status color. */}
        <div className={hasScore ? 'h-3 rounded-full bg-steel' : 'h-3 rounded-full border-2 border-dashed border-line-hi'}>
          {hasScore && <div className="h-full rounded-full bg-ink/85" style={{ width: `${Math.min(100, Math.max(0, score * 10))}%` }} />}
        </div>

        {explanation.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-[0.75rem] text-muted label-caps">
              <ListTree aria-hidden className="size-4" /> How the backend scored it
            </p>
            <ul className="flex flex-col gap-1 text-[0.98rem]">
              {explanation.map((line) => (
                <li key={line} className="border-l-2 border-line-hi pl-3">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        {site.hazard_subscores && (
          <dl className="grid grid-cols-5 gap-3">
            {SUBSCORES.map((k) => {
              const value = site.hazard_subscores?.[k] ?? null
              return (
                <div key={k} className="flex flex-col gap-1.5">
                  <dt className="text-[0.75rem] text-muted label-caps">{k}</dt>
                  <dd className="font-display text-2xl font-bold">{value === null ? <MissingValue what={`${k} sub-score`} /> : fmtNum(value)}</dd>
                  <div className="h-1.5 rounded-full bg-steel">
                    {value !== null && <div className="h-full rounded-full bg-ink/70" style={{ width: `${value * 10}%` }} />}
                  </div>
                </div>
              )
            })}
          </dl>
        )}

        {alerts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {alerts.map((event) => (
              <li key={event} className="flex items-start gap-2.5 rounded-[3px] border border-stop/70 bg-stop/10 px-3 py-2">
                <Siren aria-hidden className="mt-0.5 size-5 shrink-0 text-stop-glow" />
                <span>
                  <span className="font-semibold">{event}</span>
                  <span className="block text-[0.82rem] text-muted">
                    Official alert · {nws?.source ?? 'NWS'}
                    {nws && ` · checked ${fmtWhen(nws.fetched_at)}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : nws && nws.value !== null ? (
          <p className="flex items-center gap-2 text-[0.95rem]">
            <Siren aria-hidden className="size-4 text-muted" /> NWS alerts: <span className="font-semibold">None active</span>
            <span className="text-muted">· checked {fmtWhen(nws.fetched_at)}</span>
          </p>
        ) : (
          !isDemo && (
            <p className="flex flex-wrap items-center gap-2 text-[0.95rem]">
              <Siren aria-hidden className="size-4 text-muted" /> NWS alerts: <MissingValue what="NWS alerts" />
              <span className="text-muted">the alert check failed, so the site can't be called safe</span>
            </p>
          )
        )}

        {weatherObs.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {weatherObs.map((o) => (
              <div key={o.variable} className="flex items-center justify-between gap-3 border-b border-line/70 pb-2" title={observationLabel(o)}>
                <dt className="flex items-center gap-2 text-muted">
                  {createElement(fieldIcon(o.variable), { 'aria-hidden': true, className: 'size-4' })}
                  {fieldLabel(o.variable)}
                </dt>
                <dd className="flex items-center gap-2 font-semibold">
                  {o.value === null ? <MissingValue what={fieldLabel(o.variable)} /> : fmtObservation(o)}
                  {o.quality !== 'available' && <QualityChip quality={o.quality} />}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Card>
  )
}
