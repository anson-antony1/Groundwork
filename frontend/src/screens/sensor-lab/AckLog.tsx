import { Flag, Hand, ListChecks } from 'lucide-react'
import { useDeviceEvents } from '../../api/queries'
import { Card } from '../../components/Card'
import { ClearCrewFlag } from '../../components/ClearCrewFlag'
import { QualityChip } from '../../components/Provenance'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/States'
import { StatusTag } from '../../components/StatusTag'
import { fmtClock, fmtWhen } from '../../domain/format'

const EVENT = {
  ack_touch: { icon: Hand, label: 'Touch · alarm acknowledged' },
  crew_flag: { icon: Flag, label: 'Button held 2 s · crew flag' },
} as const

/** Beacon acknowledgments and crew flags, newest first (README §9 Screen 3, P15). */
export function AckLog({ flagged }: { flagged: boolean }) {
  const events = useDeviceEvents()
  const rows = events.data?.data ?? []
  return (
    <Card
      title="Acknowledgment and crew-flag log"
      icon={<ListChecks aria-hidden className="size-4" />}
      right={flagged ? <ClearCrewFlag /> : undefined}
      footer="A touch silences the alarm and is logged; it never clears STOP WORK. A crew flag puts the tray into supervisor review without changing the weather."
    >
      {events.isLoading && <LoadingBlock label="Loading beacon events" />}
      {events.isError && !events.data && <ErrorBlock title="Beacon events unavailable" error={events.error} />}
      {events.data && rows.length === 0 && (
        <EmptyBlock title="No acknowledgments or flags yet">Touch the beacon during STOP WORK, or hold its button for 2 seconds.</EmptyBlock>
      )}
      {rows.length > 0 && (
        <ol className="flex flex-col">
          {rows.slice(0, 10).map((e) => {
            const kind = EVENT[e.event]
            const Icon = kind.icon
            return (
              <li key={e.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-line/60 py-3">
                <Icon aria-hidden className="size-6 text-ink" />
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-semibold">{kind.label}</span>
                  <span className="flex flex-wrap items-center gap-2 text-[0.82rem] text-muted">
                    while <StatusTag status={e.status_at_event} compact size="sm" />
                    <QualityChip quality={e.mode} />
                  </span>
                </span>
                <span className="text-right">
                  <time dateTime={e.recorded_at} title={fmtWhen(e.recorded_at)} className="block font-display text-2xl font-bold num">
                    {fmtClock(e.recorded_at)}
                  </time>
                  <span className="text-[0.75rem] text-muted">received {fmtClock(e.received_at)}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
