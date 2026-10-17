import { CloudLightning, CloudSun, History, Info, Loader2, OctagonX, Radio } from 'lucide-react'
import { useState } from 'react'
import { hasEndpoint } from '../../api/config'
import { describeError } from '../../api/errors'
import { PROPOSED_ENDPOINTS } from '../../api/proposed'
import type { ReplayScenario } from '../../api/proposed'
import { useEvents, useReplayControl, useReplayScenarios } from '../../api/queries'
import { useServerCtx } from '../../api/serverCtx'
import { Card } from '../../components/Card'
import { cx } from '../../components/cx'
import { EmptyBlock } from '../../components/States'
import { fmtClock, fmtWhen } from '../../domain/format'
import { replayLabel } from '../../domain/provenance'

const DEFAULT_SCENARIO: ReplayScenario = {
  id: 'demo-storm',
  title: 'Recorded storm',
  event: 'The historical severe-weather event in the backend’s storm fixture',
  source: 'Shown above once the replay starts (fixtures/storm_replay.json)',
}

/** Screen 4 (README §9): replay a sourced historical storm; exiting restores live data, never blended. */
export function ReplayScreen() {
  const { replay, replayEnvelope } = useServerCtx()
  const { start, stop } = useReplayControl()
  const scenariosQuery = useReplayScenarios()
  const events = useEvents()
  const scenarios = scenariosQuery.data?.data?.length ? scenariosQuery.data.data : [DEFAULT_SCENARIO]
  const [chosen, setChosen] = useState(scenarios[0].id)
  const active = replay?.active ?? false
  const busy = start.isPending || stop.isPending
  const log = (events.data?.data ?? []).filter((e) => e.kind === 'replay_started' || e.kind === 'replay_stopped').slice(0, 8)

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5 pb-8">
      <header>
        <h1 className="font-display text-[2.6rem] leading-none font-bold tracking-wide uppercase">Storm replay</h1>
        <p className="mt-2 max-w-3xl text-lg text-muted">
          Replays a recorded severe-weather event so you can see the STOP WORK override end to end. Exiting restores the
          current live or cached data.
        </p>
      </header>

      {(replayEnvelope?.errors ?? []).map((e) => (
        <p key={e} className="rounded-[3px] border border-caution/60 bg-caution/10 px-4 py-2 text-caution">
          Data note: {e}
        </p>
      ))}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card
          title="Replay state"
          icon={<Radio aria-hidden className="size-4" />}
          tone={active ? 'stop' : undefined}
          footer="State comes from the server (GET /replay), so a replay started from any laptop shows here within 2 seconds."
        >
          <div className="flex flex-col gap-5">
            <div className={cx('flex items-center gap-4 rounded-[4px] border-2 p-5', active ? 'border-stop bg-stop/15' : 'border-line-hi bg-steel')}>
              {active ? <OctagonX aria-hidden className="size-14 shrink-0 text-stop-glow" /> : <CloudSun aria-hidden className="size-14 shrink-0 text-muted" />}
              <div>
                <p className="font-display text-4xl font-bold tracking-wide uppercase">{active ? 'Historical replay active' : 'Live data'}</p>
                <p className="mt-1 text-muted">
                  {active
                    ? `${replayLabel(replay?.source)}${replay?.started_at ? ` · started ${fmtClock(replay.started_at)}` : ''} · every site shows STOP WORK`
                    : 'Sites show the current live or cached snapshot.'}
                </p>
              </div>
            </div>

            {active ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => stop.mutate()}
                className="flex min-h-16 items-center justify-center gap-3 rounded-[4px] bg-accent text-xl text-accent-ink label-caps disabled:opacity-60"
              >
                {stop.isPending ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <CloudSun aria-hidden className="size-6" />}
                Exit replay · restore live data
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => start.mutate(chosen)}
                className="flex min-h-16 items-center justify-center gap-3 rounded-[4px] border-2 border-ink bg-ink text-xl text-bg label-caps hover:bg-ink/90 disabled:opacity-60"
              >
                {start.isPending ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <CloudLightning aria-hidden className="size-6" />}
                Start storm replay
              </button>
            )}
            {(start.isError || stop.isError) && (
              <p role="alert" className="text-caution">
                {describeError(start.error ?? stop.error)}
              </p>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="Scenario" icon={<CloudLightning aria-hidden className="size-4" />}>
            <div role="radiogroup" aria-label="Replay scenario" className="flex flex-col gap-3">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen === s.id}
                  disabled={active}
                  onClick={() => setChosen(s.id)}
                  className={cx('flex flex-col items-start gap-1 rounded-[4px] border-2 p-4 text-left', chosen === s.id ? 'border-accent bg-steel-hi' : 'border-line hover:border-line-hi')}
                >
                  <span className="text-lg font-semibold">{s.title}</span>
                  <span>{s.event}</span>
                  <span className="text-[0.85rem] text-muted">Source: {s.source}</span>
                  {(s.onset || s.expires) && (
                    <span className="text-[0.85rem] text-muted">
                      {fmtWhen(s.onset)} → {fmtWhen(s.expires)}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {!hasEndpoint(PROPOSED_ENDPOINTS.replayScenarios) && (
              <p className="mt-3 text-[0.82rem] text-muted">The backend doesn't list scenarios yet; it replays its default storm.</p>
            )}
          </Card>

          <Card title="How replay stays separate" icon={<Info aria-hidden className="size-4" />}>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-[0.95rem]">
              <li>Replay data and live data are cached separately; switching drops the old context's data.</li>
              <li>Any response from the other context is discarded, never shown.</li>
              <li>The beacon alarm re-arms on each new replay; a touch acknowledges it but doesn't clear STOP WORK.</li>
            </ul>
          </Card>

          <Card title="Replay log" icon={<History aria-hidden className="size-4" />}>
            {log.length === 0 ? (
              <EmptyBlock title="No replays yet" />
            ) : (
              <ol className="flex flex-col">
                {log.map((e) => (
                  <li key={e.id} className="flex gap-3 border-b border-line/60 py-2">
                    <time className="text-muted num">{fmtClock(e.at)}</time>
                    <span>{e.summary}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
