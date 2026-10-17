import { Camera, CloudLightning, CloudSun, FileText, Flag, FlagOff, Hand, History } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEvents } from '../../api/queries'
import type { TimelineKind } from '../../api/types'
import { Card } from '../../components/Card'
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/States'
import { fmtClock, fmtWhen } from '../../domain/format'

const KIND: Record<TimelineKind, { icon: LucideIcon; label: string }> = {
  ack_touch: { icon: Hand, label: 'Beacon acknowledged' },
  crew_flag: { icon: Flag, label: 'Crew flag' },
  crew_flag_cleared: { icon: FlagOff, label: 'Crew flag cleared' },
  hazard_report: { icon: Camera, label: 'Crew report' },
  replay_started: { icon: CloudLightning, label: 'Storm replay started' },
  replay_stopped: { icon: CloudSun, label: 'Storm replay ended' },
  briefing_generated: { icon: FileText, label: '6 PM plan generated' },
}

/** Chronological log for one site, including site-less events (replay start/stop) that apply to all. */
export function SiteTimeline({ siteId }: { siteId: string }) {
  const events = useEvents(siteId)
  return (
    <Card title="Event log" icon={<History aria-hidden className="size-4" />}>
      {events.isLoading && <LoadingBlock label="Loading events" />}
      {events.isError && !events.data && <ErrorBlock title="Event log unavailable" error={events.error} />}
      {events.data && events.data.data.length === 0 && <EmptyBlock title="Nothing logged yet">Acknowledgments, crew reports and replays appear here.</EmptyBlock>}
      {events.data && events.data.data.length > 0 && (
        <ol className="flex flex-col">
          {events.data.data.slice(0, 12).map((e) => {
            const k = KIND[e.kind] ?? { icon: History, label: e.kind }
            const Icon = k.icon
            return (
              <li key={e.id} className="grid grid-cols-[4.5rem_1.5rem_1fr] items-start gap-2 border-b border-line/60 py-2.5 text-[0.9rem]">
                <time dateTime={e.at} title={fmtWhen(e.at)} className="text-muted num">
                  {fmtClock(e.at)}
                </time>
                <Icon aria-hidden className="mt-0.5 size-4 text-muted" />
                <span>
                  <span className="font-semibold">{k.label}</span>
                  <span className="block text-muted">{e.summary}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
