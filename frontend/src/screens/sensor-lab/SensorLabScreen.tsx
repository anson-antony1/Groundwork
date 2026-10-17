import { ArrowRight, Cable, Radio, Unplug } from 'lucide-react'
import { Link } from 'wouter'
import { DEMO_DEVICE_ID, DEMO_SITE_ID } from '../../api/config'
import { useDeviceEvents, useDisplay, useLatestReading, usePolicies, useReadingHistory, useSite } from '../../api/queries'
import type { Reading } from '../../api/types'
import { BeaconReplica } from '../../components/BeaconReplica'
import { Card } from '../../components/Card'
import { ClearCrewFlag } from '../../components/ClearCrewFlag'
import { cx } from '../../components/cx'
import { StatusTag } from '../../components/StatusTag'
import { useNow } from '../../hooks/useNow'
import { VEHICLE_LABEL, ageSeconds, fmtAgo, fmtClock, fmtWhen } from '../../domain/format'
import { sensorReplayLabel } from '../../domain/provenance'
import { STALE_BUDGET_MS, isStale } from '../../domain/staleness'
import { MoistureChart } from './charts'
import { ReadingTiles } from './ReadingTiles'

/** The beacon goes NO LINK after 6 s without a status line; readings stop on the same USB link. */
const LINK_SECONDS = 6

interface LinkState {
  ok: boolean
  text: string
}

function linkState(displayOk: boolean, reading: Reading | null, age: number | null, now: number): LinkState {
  if (!displayOk) return { ok: false, text: 'API unreachable · beacon status unknown' }
  if (!reading || age === null) return { ok: false, text: 'Beacon not connected · no readings yet' }
  if (age > LINK_SECONDS) return { ok: false, text: `No link · last reading ${fmtAgo(reading.received_at, now)}` }
  return { ok: true, text: `Link OK · reading ${age < 2 ? 'just now' : `${age} s ago`}` }
}

/** How to use the beacon, the last tap or flag it logged, and the supervisor's clear button when flagged. */
function BeaconNote({ flagged }: { flagged: boolean }) {
  const latest = useDeviceEvents().data?.data[0]
  return (
    <div className="flex flex-col gap-1.5 px-1 text-[0.88rem] text-muted">
      <p>Tap the beacon to silence an alarm (it never clears STOP WORK). Hold its button 2 s to flag a problem for a supervisor.</p>
      {latest && (
        <p className="text-ink">
          <time dateTime={latest.recorded_at} title={fmtWhen(latest.recorded_at)}>
            {latest.event === 'ack_touch' ? `Last tap: ${fmtClock(latest.recorded_at)} · alarm silenced` : `Last crew flag: ${fmtClock(latest.recorded_at)}`}
          </time>
        </p>
      )}
      {flagged && (
        <span className="flex flex-wrap items-center gap-3 text-ink">
          Crew flag is on: the tray shows SUPERVISOR REVIEW. <ClearCrewFlag />
        </span>
      )}
    </div>
  )
}

/** Screen 2 (README §9): the demo tray's live readings and the physical beacon, mirrored large enough to read from the back of the room. */
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
          <h1 className="font-display text-[2.6rem] leading-none font-bold tracking-wide uppercase">Demo tray</h1>
          <p className="mt-1 max-w-3xl text-muted">
            Live readings from the soil tray at our table. Wetter soil changes the reading, the server re-scores the tray, and the beacon shows the result.
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
        <div className="flex flex-col gap-5">
          <BeaconReplica display={display.data ?? null} linked={link.ok} deviceId={DEMO_DEVICE_ID} />
          <BeaconNote flagged={display.data?.effective_status === 'SUPERVISOR_REVIEW'} />
          <Card title="The call for this tray" icon={<Radio aria-hidden className="size-4" />}>
            {site ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  {(['pickup', 'heavy_truck'] as const).map((v) => (
                    <span key={v} className="flex items-center gap-3">
                      <span className="text-lg font-semibold">{VEHICLE_LABEL[v]}</span>
                      <StatusTag status={site.effective_status[v]} size="md" />
                    </span>
                  ))}
                </div>
                <p className="text-[0.88rem] text-muted">The beacon always shows the heavy truck (HVY on its screen).</p>
                <Link href={`/sites/${DEMO_SITE_ID}`} transition className="flex items-center gap-1.5 text-accent label-caps hover:underline">
                  Plan mats and cost for the tray <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
            ) : (
              <p className="text-muted">Loading the demo tray…</p>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <ReadingTiles reading={reading} now={now} stale={!link.ok} />
          <MoistureChart readings={series} policy={policy} now={now} />
        </div>
      </div>
    </div>
  )
}
