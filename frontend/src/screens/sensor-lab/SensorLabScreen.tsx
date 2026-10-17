import { Cable, Radio, Unplug } from 'lucide-react'
import { DEMO_DEVICE_ID, DEMO_SITE_ID } from '../../api/config'
import { useDisplay, useLatestReading, usePolicies, useReadingHistory, useSite } from '../../api/queries'
import type { Reading } from '../../api/types'
import { BeaconReplica } from '../../components/BeaconReplica'
import { Card } from '../../components/Card'
import { cx } from '../../components/cx'
import { StatusTag } from '../../components/StatusTag'
import { useNow } from '../../hooks/useNow'
import { VEHICLE_LABEL, ageSeconds, fmtAgo } from '../../domain/format'
import { LABELS, sensorReplayLabel } from '../../domain/provenance'
import { STALE_BUDGET_MS, isStale } from '../../domain/staleness'
import { AckLog } from './AckLog'
import { MoistureChart, PressurePanel } from './charts'
import { ReadingTiles } from './ReadingTiles'

/** The beacon goes NO LINK after 6 s without a status line; readings stop on the same USB link. */
const LINK_SECONDS = 6

interface LinkState {
  ok: boolean
  text: string
}

function linkState(displayOk: boolean, reading: Reading | null, age: number | null, now: number): LinkState {
  if (!displayOk) return { ok: false, text: 'API unreachable · beacon status unknown' }
  if (!reading || age === null) return { ok: false, text: 'No link · no readings yet (is serial_bridge.py running?)' }
  if (age > LINK_SECONDS) return { ok: false, text: `No link · last reading ${fmtAgo(reading.received_at, now)}` }
  return { ok: true, text: `Link OK · reading ${age < 2 ? 'just now' : `${age} s ago`}` }
}

/** Screen 3 (README §9): the physical beacon, mirrored large enough to read from the back of the room. */
export function SensorLabScreen() {
  const now = useNow(500)
  const display = useDisplay(DEMO_DEVICE_ID, 1_000)
  const latest = useLatestReading()
  const history = useReadingHistory()
  const tray = useSite(DEMO_SITE_ID)
  const policy = usePolicies().data?.data

  const reading = latest.data?.data ?? null
  const age = reading ? ageSeconds(reading.received_at, now) : null
  const displayOk = Boolean(display.data) && !isStale({ updatedAt: display.dataUpdatedAt, now, budgetMs: STALE_BUDGET_MS.beacon, failed: display.isError })
  const link = linkState(displayOk, reading, age, now)
  const recorded = reading?.mode === 'sensor_replay'
  const series = [...(history.data?.data ?? [])].reverse()
  const site = tray.data?.data

  return (
    <div className="mx-auto flex max-w-[1800px] flex-col gap-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2.6rem] leading-none font-bold tracking-wide uppercase">Sensor lab</h1>
          <p className="mt-1 text-muted">
            Beacon {DEMO_DEVICE_ID} at {DEMO_SITE_ID} · {LABELS.demoSensor}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {recorded && (
            <span className="rounded-[3px] border-2 border-accent bg-accent/15 px-3 py-1.5 text-lg text-accent label-caps">
              {sensorReplayLabel(reading?.calibration)} · not live hardware
            </span>
          )}
          <span
            role="status"
            className={cx('flex items-center gap-2 rounded-[3px] border-2 px-3 py-1.5 text-[0.95rem] label-caps', link.ok ? 'border-line-hi text-ink' : 'border-dashed border-unknown text-unknown')}
          >
            {link.ok ? <Cable aria-hidden className="size-5 text-accent" /> : <Unplug aria-hidden className="size-5" />}
            {link.text}
          </span>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <BeaconReplica display={display.data ?? null} linked={link.ok} deviceId={DEMO_DEVICE_ID} />
        <div className="flex flex-col gap-5">
          <ReadingTiles reading={reading} now={now} stale={!link.ok} />
          <Card title="What the dashboard calls the tray" icon={<Radio aria-hidden className="size-4" />}>
            {site ? (
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                {(['pickup', 'heavy_truck'] as const).map((v) => (
                  <span key={v} className="flex items-center gap-3">
                    <span className="text-lg font-semibold">{VEHICLE_LABEL[v]}</span>
                    <StatusTag status={site.effective_status[v]} size="md" />
                  </span>
                ))}
                <span className="rounded-[3px] border border-line-hi px-2 py-1 text-[0.75rem] text-muted label-caps">Beacon evaluates: Heavy truck</span>
              </div>
            ) : (
              <p className="text-muted">Loading the demo tray…</p>
            )}
          </Card>
        </div>
      </div>

      <MoistureChart readings={series} policy={policy} now={now} />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <AckLog flagged={display.data?.effective_status === 'SUPERVISOR_REVIEW'} />
        <PressurePanel readings={series} now={now} />
      </div>
    </div>
  )
}
