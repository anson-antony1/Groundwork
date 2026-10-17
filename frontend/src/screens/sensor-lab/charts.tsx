import { Activity, Gauge } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Policy, Reading } from '../../api/types'
import { Card } from '../../components/Card'
import { EmptyBlock } from '../../components/States'
import { fmtClock, fmtShortClock } from '../../domain/format'
import { LABELS } from '../../domain/provenance'

const WINDOW_MS = 5 * 60 * 1000
const AXIS = { stroke: 'var(--color-line-hi)', tick: { fill: 'var(--color-muted)', fontSize: 13 } }

interface Point {
  t: number
  v: number
}

/** One tick per whole minute across the window, so the axis reads 21:01, 21:02, … */
function minuteTicks(now: number): number[] {
  const ticks: number[] = []
  for (let t = Math.ceil((now - WINDOW_MS) / 60_000) * 60_000; t <= now; t += 60_000) ticks.push(t)
  return ticks
}

function points(readings: Reading[], pick: (r: Reading) => number | null, now: number): Point[] {
  const from = now - WINDOW_MS
  return readings
    .map((r) => ({ t: Date.parse(r.received_at), v: pick(r) }))
    .filter((p): p is Point => p.v !== null && p.t >= from)
}

/** Crosshair readout: the value leads, the label follows (dataviz interaction spec). */
function Readout({ active, payload, unit, label }: { active?: boolean; payload?: { payload: Point }[]; unit: string; label: string }) {
  const p = active ? payload?.[0]?.payload : undefined
  if (!p) return null
  return (
    <div className="rounded-[4px] border border-line-hi bg-panel px-3 py-2 shadow-[0_8px_20px_rgb(0_0_0/0.5)]">
      <p className="font-display text-2xl leading-none font-bold">
        {p.v.toFixed(1)} <span className="text-sm text-muted">{unit}</span>
      </p>
      <p className="mt-1 text-[0.78rem] text-muted">
        {label} · {fmtClock(new Date(p.t).toISOString())}
      </p>
    </div>
  )
}

/** Live moisture trace with the beacon's (heavy-truck) policy bands, so the pour visibly crosses a line. */
export function MoistureChart({ readings, policy, now }: { readings: Reading[]; policy: Policy | undefined; now: number }) {
  const data = points(readings, (r) => r.moisture_index, now)
  const last = data.at(-1)
  const heavy = policy?.demo_tray_access.heavy_truck
  return (
    <Card
      title="Soil moisture index · last 5 minutes"
      icon={<Activity aria-hidden className="size-4" />}
      right={<span className="text-[0.78rem] text-muted">Bands: heavy-truck policy, which the beacon evaluates</span>}
      footer={`${LABELS.demoSensor} · ${policy?.label ?? 'Demo policy'}`}
    >
      {data.length < 2 ? (
        <EmptyBlock title="Waiting for readings">The trace starts once the beacon sends readings (about one per second).</EmptyBlock>
      ) : (
        <>
          <div className="h-72" role="img" aria-label={`Moisture index over the last 5 minutes, now ${last?.v.toFixed(1)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
                {heavy && (
                  <>
                    <ReferenceArea y1={0} y2={heavy.go_below} fill="var(--color-go)" fillOpacity={0.1} stroke="none" label={{ value: 'Heavy truck: GO', position: 'insideBottomLeft', fill: 'var(--color-go)', fontSize: 13 }} />
                    <ReferenceArea y1={heavy.go_below} y2={heavy.mats_below} fill="var(--color-caution)" fillOpacity={0.12} stroke="none" label={{ value: 'Heavy truck: MATS', position: 'insideLeft', fill: 'var(--color-caution)', fontSize: 13 }} />
                    <ReferenceArea y1={heavy.mats_below} y2={100} fill="var(--color-nogo)" fillOpacity={0.14} stroke="none" label={{ value: 'Heavy truck: NO-GO', position: 'insideTopLeft', fill: 'var(--color-nogo-text)', fontSize: 13 }} />
                  </>
                )}
                <CartesianGrid stroke="var(--color-line)" strokeWidth={1} vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={[now - WINDOW_MS, now]} ticks={minuteTicks(now)} tickFormatter={(t: number) => fmtShortClock(new Date(t).toISOString())} {...AXIS} />
                <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} width={40} {...AXIS} />
                <Tooltip content={<Readout unit="/ 100" label="moisture index" />} cursor={{ stroke: 'var(--color-muted)', strokeWidth: 1 }} isAnimationActive={false} />
                <Line dataKey="v" type="monotone" stroke="var(--color-ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} isAnimationActive={false} />
                {last && <ReferenceDot x={last.t} y={last.v} r={5} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={2} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-[0.85rem]">
            <summary className="cursor-pointer text-accent label-caps">Readings table</summary>
            <table className="mt-2 w-full max-w-lg text-left">
              <thead className="text-[0.75rem] text-muted label-caps">
                <tr>
                  <th className="py-1 font-normal">Received</th>
                  <th className="py-1 font-normal">Moisture</th>
                </tr>
              </thead>
              <tbody className="num">
                {data
                  .slice(-10)
                  .reverse()
                  .map((p) => (
                    <tr key={p.t} className="border-t border-line/60">
                      <td className="py-1">{fmtClock(new Date(p.t).toISOString())}</td>
                      <td className="py-1">{p.v.toFixed(1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Card>
  )
}

/** Venue pressure log (Tier 3). Advisory only: official NWS alerts are the only STOP WORK trigger. */
export function PressurePanel({ readings, now }: { readings: Reading[]; now: number }) {
  const data = points(readings, (r) => r.pressure_hpa, now)
  const values = data.map((p) => p.v)
  const lo = Math.floor(Math.min(...values) - 0.5)
  const hi = Math.ceil(Math.max(...values) + 0.5)
  return (
    <Card
      title="Venue pressure · last 5 minutes"
      icon={<Gauge aria-hidden className="size-4" />}
      footer={`${LABELS.demoBeacon} · station pressure, not sea-level adjusted · never a STOP WORK trigger`}
    >
      <p className="mb-3 text-[0.95rem]">
        3-hour tendency: <span className="font-semibold text-unknown">Unknown</span>{' '}
        <span className="text-muted">needs 3 hours of readings, and the backend doesn't report a tendency yet.</span>
      </p>
      {data.length < 2 ? (
        <EmptyBlock title="Barometer not reporting">Connect the Grove barometer (Tier 3) to start the pressure log.</EmptyBlock>
      ) : (
        <div className="h-44" role="img" aria-label={`Station pressure over the last 5 minutes, now ${data.at(-1)?.v.toFixed(1)} hPa`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--color-line)" strokeWidth={1} vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={[now - WINDOW_MS, now]} ticks={minuteTicks(now)} tickFormatter={(t: number) => fmtShortClock(new Date(t).toISOString())} {...AXIS} />
              <YAxis domain={[lo, hi]} ticks={Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)} width={52} {...AXIS} />
              <Tooltip content={<Readout unit="hPa" label="station pressure" />} cursor={{ stroke: 'var(--color-muted)', strokeWidth: 1 }} isAnimationActive={false} />
              <Line dataKey="v" type="monotone" stroke="var(--color-ink)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
