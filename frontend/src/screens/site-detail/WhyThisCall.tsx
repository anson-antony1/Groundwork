import { ArrowDown, ArrowLeft, ArrowRight, CircleHelp, Lightbulb, OctagonX, ShieldCheck, UserCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { DEMO_SITE_ID } from '../../api/config'
import type { SiteDetailView } from '../../api/proposed'
import type { Policy, Reading, Vehicle } from '../../api/types'
import { Card } from '../../components/Card'
import { ClearCrewFlag } from '../../components/ClearCrewFlag'
import { cx } from '../../components/cx'
import { fieldIcon } from '../../components/fieldIcons'
import { MissingValue } from '../../components/Provenance'
import { StatusTag, WeatherTag } from '../../components/StatusTag'
import { TONE_SOFT } from '../../components/tone'
import { VEHICLE_LABEL, fieldLabel, fmtNum, fmtObservation } from '../../domain/format'
import type { Tone } from '../../domain/status'

function Input({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 text-[0.9rem]">
      <span className="flex items-center gap-2 text-muted">
        {createElement(fieldIcon(name), { 'aria-hidden': true, className: 'size-4' })}
        {fieldLabel(name)}
      </span>
      <span className="text-right font-semibold">{children}</span>
    </li>
  )
}

function Lane({ title, children, result }: { title: string; children: ReactNode; result: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[4px] border border-line bg-bg/40 p-4">
      <p className="text-[0.78rem] text-muted label-caps">{title}</p>
      <ul className="flex flex-col">{children}</ul>
      <div className="mt-auto flex items-center gap-2 pt-1">
        <ArrowDown aria-hidden className="size-4 text-faint" />
        {result}
      </div>
    </div>
  )
}

interface Gate {
  tone: Tone | 'neutral'
  icon: LucideIcon
  title: string
  detail: string
}

/**
 * Explains the backend's own effective_status with the README §3 rule. The status itself always
 * comes from the API; this only picks the sentence that matches the values it sent.
 */
function gateFor(site: SiteDetailView, vehicle: Vehicle): Gate {
  if (site.weather_state === 'STOP_WORK') {
    return { tone: 'stop', icon: OctagonX, title: 'STOP WORK override', detail: 'Severe weather stops work for every vehicle. It cannot be averaged away, and mats do not change it.' }
  }
  if (site.weather_state === 'UNKNOWN') {
    return { tone: 'unknown', icon: CircleHelp, title: 'Weather unknown', detail: 'Missing or stale weather inputs are never treated as safe.' }
  }
  if (site.effective_status[vehicle] === 'SUPERVISOR_REVIEW') {
    return { tone: 'caution', icon: UserCheck, title: 'Crew flag', detail: 'A crew member flagged this site from the beacon. A supervisor decides; weather is unchanged.' }
  }
  if (site.access_call[vehicle] === 'UNKNOWN') {
    return { tone: 'unknown', icon: CircleHelp, title: 'Access unknown', detail: 'Ground inputs are missing, so the call is withheld rather than shown as GO.' }
  }
  return { tone: 'neutral', icon: ShieldCheck, title: 'No override', detail: 'Weather allows work, so the ground-access call for this vehicle stands.' }
}

interface WhyProps {
  site: SiteDetailView
  vehicle: Vehicle
  policy: Policy | undefined
  reading: Reading | null
  readingFresh: boolean
}

export function WhyThisCall({ site, vehicle, policy, reading, readingFresh }: WhyProps) {
  const isDemo = site.id === DEMO_SITE_ID
  const gate = gateFor(site, vehicle)
  const GateIcon = gate.icon
  const observed = new Map(site.observations.map((o) => [o.variable, o]))
  const weatherInputs = ['rain_7d', 'rain_forecast', 'gust_forecast', 'apparent_temp']
  // Official alerts from the API (alert_events), or the mock fixture's triggers.
  const alerts = site.alert_events?.length ? site.alert_events : (site.reasons?.weather_triggers ?? [])
  const nws = observed.get('nws_alerts')
  const nwsText = alerts.length ? alerts.join('; ') : nws && nws.value !== null ? 'None active' : null
  const explanation = site.hazard_explanation ?? []
  const soil = observed.get('usda_soil')

  return (
    <Card title="Why this call?" icon={<Lightbulb aria-hidden className="size-4" />} footer={`Decision rule (README §3): STOP WORK overrides everything; missing data is never safe; otherwise the vehicle's access call stands.`}>
      <div className="grid gap-4 xl:grid-cols-[1fr_auto_1fr] xl:items-stretch">
        <Lane title="Weather safety · all vehicles" result={<WeatherTag state={site.weather_state} />}>
          {isDemo ? (
            <li className="py-1.5 text-[0.9rem] text-muted">Demo tray: no weather feed; calm-weather demo scenario.</li>
          ) : (
            weatherInputs.map((name) => {
              const o = observed.get(name)
              return (
                <Input key={name} name={name}>
                  {o && o.value !== null ? fmtObservation(o) : <MissingValue what={fieldLabel(name)} />}
                </Input>
              )
            })
          )}
          {!isDemo && <Input name="nws_alerts">{nwsText ?? <MissingValue what="NWS alerts" />}</Input>}
          {isDemo && alerts.length > 0 && <li className="py-1.5 text-[0.9rem] font-semibold">{alerts.join('; ')}</li>}
          {explanation.map((line) => (
            <li key={line} className="py-1 text-[0.85rem] text-muted">
              {line}
            </li>
          ))}
        </Lane>

        <div className="flex items-center justify-center gap-2">
          <ArrowRight aria-hidden className="hidden size-6 text-faint xl:block" />
          <div className={cx('flex w-full max-w-[17rem] flex-col items-center gap-2 rounded-[4px] border-2 px-4 py-3 text-center', gate.tone === 'neutral' ? 'border-line-hi bg-steel' : TONE_SOFT[gate.tone])}>
            <GateIcon aria-hidden className="size-7" />
            <p className="label-caps">{gate.title}</p>
            <p className="text-[0.85rem] text-muted">{gate.detail}</p>
            {isDemo && gate.title === 'Crew flag' && <ClearCrewFlag />}
          </div>
          <ArrowLeft aria-hidden className="hidden size-6 text-faint xl:block" />
        </div>

        <Lane title={`Ground access · ${VEHICLE_LABEL[vehicle]}`} result={<StatusTag status={site.access_call[vehicle]} />}>
          {isDemo ? (
            <>
              <Input name="demo_tray_moisture">
                {readingFresh && reading ? fmtNum(reading.moisture_index) : <MissingValue what="tray moisture" />}
              </Input>
              {policy && (
                <li className="py-1.5 text-[0.85rem] text-muted">
                  {VEHICLE_LABEL[vehicle]}: GO below {policy.demo_tray_access[vehicle].go_below}, mats below {policy.demo_tray_access[vehicle].mats_below}
                </li>
              )}
            </>
          ) : (
            <>
              <Input name="usda_soil">
                {soil && soil.value !== null ? fmtObservation(soil) : (site.reasons?.soil_drainage ?? <MissingValue what="USDA soil drainage" />)}
              </Input>
              <Input name="rain_7d">
                {observed.get('rain_7d')?.value != null ? fmtObservation(observed.get('rain_7d')!) : <MissingValue what="7-day rainfall" />}
              </Input>
            </>
          )}
          <li className="py-1.5 text-[0.9rem]">
            <span className="text-muted">Vehicle class:</span> <span className="font-semibold">{VEHICLE_LABEL[vehicle]}</span>
          </li>
        </Lane>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-4 border-t border-line pt-5">
        <ArrowDown aria-hidden className="size-6 text-faint" />
        <p className="text-muted label-caps">Effective · {VEHICLE_LABEL[vehicle]}</p>
        <StatusTag status={site.effective_status[vehicle]} size="lg" emphasize={site.effective_status[vehicle] === 'STOP_WORK'} />
      </div>
      {site.missing_fields.length > 0 && (
        <p className="mt-3 text-center text-[0.9rem] text-unknown">
          Missing inputs: {site.missing_fields.map(fieldLabel).join(', ')}. Never treated as low risk.
        </p>
      )}
    </Card>
  )
}
