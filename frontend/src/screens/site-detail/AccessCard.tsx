import { Droplets, Layers, Layers3 } from 'lucide-react'
import { DEMO_SITE_ID } from '../../api/config'
import type { SiteDetailView } from '../../api/proposed'
import type { Policy, Reading, Vehicle } from '../../api/types'
import { VEHICLES } from '../../api/types'
import { Card } from '../../components/Card'
import { cx } from '../../components/cx'
import { MissingValue, ProvenanceLine } from '../../components/Provenance'
import { StatusTag } from '../../components/StatusTag'
import { VehicleSwitch } from '../../components/VehicleSwitch'
import { VEHICLE_LABEL, ageSeconds, fmtAgo, fmtNum, fmtObservation } from '../../domain/format'
import { LABELS, observationLabel, surveyLabel } from '../../domain/provenance'
import { accessVisual } from '../../domain/status'

/** Where the tray's reading sits on the policy's thresholds for this vehicle (values from /policies). */
function MoistureScale({ policy, vehicle, moisture }: { policy: Policy; vehicle: Vehicle; moisture: number | null }) {
  const { go_below: go, mats_below: mats } = policy.demo_tray_access[vehicle]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex h-4 overflow-visible rounded-[2px]">
        <span className="h-full bg-go/35" style={{ width: `${go}%` }} />
        <span className="h-full bg-caution/40" style={{ width: `${mats - go}%` }} />
        <span className="h-full flex-1 bg-nogo/45" />
        {moisture !== null && (
          <span className="absolute -top-1.5 -bottom-1.5 w-1 -translate-x-1/2 rounded-full bg-ink shadow-[0_0_0_2px_#111315]" style={{ left: `${moisture}%` }} />
        )}
      </div>
      <div className="flex justify-between text-[0.75rem] text-muted label-caps">
        <span>GO below {go}</span>
        <span>Mats below {mats}</span>
        <span>No-go {mats}+</span>
      </div>
    </div>
  )
}

interface AccessCardProps {
  site: SiteDetailView
  vehicle: Vehicle
  policy: Policy | undefined
  /** Latest demo-tray reading (DEMO-TRAY only). */
  reading: Reading | null
  now: number
  stale: boolean
}

/** Ground access, per vehicle (README §3B). A planning recommendation, not a certification. */
export function AccessCard({ site, vehicle, policy, reading, now, stale }: AccessCardProps) {
  const isDemo = site.id === DEMO_SITE_ID
  const call = stale ? 'STALE' : site.access_call[vehicle]
  const overridden = !stale && site.weather_state === 'STOP_WORK'
  const v = accessVisual(site.access_call[vehicle])
  const readingAge = reading ? ageSeconds(reading.received_at, now) : null
  const readingFresh = reading !== null && readingAge !== null && readingAge <= (policy?.sensor_stale_seconds ?? 15)
  const rain7d = site.observations.find((o) => o.variable === 'rain_7d')
  const soil = site.observations.find((o) => o.variable === 'usda_soil')
  const clay = site.observations.find((o) => o.variable === 'usda_clay_pct')

  return (
    <Card
      title="Ground access · per vehicle"
      icon={<Layers aria-hidden className="size-4" />}
      tone={stale ? 'unknown' : v.tone}
      footer={<ProvenanceLine>Planning recommendation, not a soil-load certification</ProvenanceLine>}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <VehicleSwitch size="lg" />
          {isDemo && <span className="rounded-[3px] border border-line-hi px-2 py-1 text-[0.75rem] text-muted label-caps">Beacon evaluates: Heavy truck</span>}
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative flex items-center gap-4">
            <span className={overridden ? 'opacity-45' : undefined}>
              <StatusTag status={call} size="lg" />
            </span>
            {overridden && (
              <span className="-rotate-3 rounded-[3px] border-2 border-stop-glow px-2.5 py-1 text-stop-glow label-caps">Overridden by STOP WORK</span>
            )}
          </div>
          <p className="text-muted">{overridden ? 'Weather stops work for every vehicle. Mats do not make severe weather safe.' : v.hint}</p>
        </div>

        <table className="w-full text-left text-[0.92rem]">
          <thead>
            <tr className="text-[0.75rem] text-muted label-caps">
              <th className="pb-2 font-normal">Vehicle</th>
              <th className="pb-2 font-normal">Access call</th>
              <th className="pb-2 font-normal">Effective</th>
            </tr>
          </thead>
          <tbody>
            {VEHICLES.map((veh) => (
              <tr key={veh} className={cx('border-t border-line/70', veh === vehicle && 'bg-steel-hi/60')}>
                <td className="py-2 pl-1 font-semibold">{VEHICLE_LABEL[veh]}</td>
                <td className="py-2">
                  <StatusTag status={stale ? 'STALE' : site.access_call[veh]} compact size="sm" />
                </td>
                <td className="py-2">
                  <StatusTag status={stale ? 'STALE' : site.effective_status[veh]} compact size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col gap-3 rounded-[3px] border border-line bg-bg/40 p-4">
          <p className="text-[0.75rem] text-muted label-caps">Basis</p>
          {isDemo ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <Droplets aria-hidden className="size-4 self-center text-accent" />
                Tray moisture index
                <span className="font-display text-2xl font-bold">{readingFresh ? fmtNum(reading.moisture_index) : <MissingValue what="tray moisture" />}</span>
                <span className="text-[0.82rem] text-muted">
                  {reading ? `${LABELS.demoSensor} · ${fmtAgo(reading.received_at, now)}` : 'No reading yet: is the bridge running?'}
                </span>
              </p>
              {policy && <MoistureScale policy={policy} vehicle={vehicle} moisture={readingFresh ? reading.moisture_index : null} />}
              {policy && <p className="text-[0.78rem] text-muted">{policy.demo_tray_access.basis} · {policy.label}</p>}
            </>
          ) : (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <div title={soil ? observationLabel(soil) : undefined}>
                <dt className="flex items-center gap-1.5 text-[0.82rem] text-muted">
                  <Layers3 aria-hidden className="size-4" /> Soil drainage
                </dt>
                <dd className="font-semibold">
                  {soil && soil.value !== null ? fmtObservation(soil) : (site.reasons?.soil_drainage ?? <MissingValue what="USDA soil drainage" />)}
                </dd>
                {soil && <dd className="text-[0.75rem] text-muted">{surveyLabel(soil.source, soil.fetched_at)}</dd>}
              </div>
              <div title={clay ? observationLabel(clay) : undefined}>
                <dt className="text-[0.82rem] text-muted">Soil clay content</dt>
                <dd className="font-semibold">{clay && clay.value !== null ? fmtObservation(clay) : <MissingValue what="soil clay content" />}</dd>
              </div>
              <div>
                <dt className="text-[0.82rem] text-muted">Recent rain (7 days)</dt>
                <dd className="font-semibold">{rain7d && rain7d.value !== null ? fmtObservation(rain7d) : <MissingValue what="7-day rainfall" />}</dd>
              </div>
              <div>
                <dt className="text-[0.82rem] text-muted">Vehicle class</dt>
                <dd className="font-semibold">{VEHICLE_LABEL[vehicle]} · {LABELS.scenarioAssumption}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>
    </Card>
  )
}
