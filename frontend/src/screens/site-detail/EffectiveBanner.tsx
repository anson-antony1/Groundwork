import type { SiteDetailView } from '../../api/proposed'
import type { Vehicle } from '../../api/types'
import { cx } from '../../components/cx'
import { StatusTag } from '../../components/StatusTag'
import { TONE_SOFT } from '../../components/tone'
import { VEHICLE_LABEL } from '../../domain/format'
import { accessVisual, statusVisual, weatherVisual } from '../../domain/status'
import type { StatusKey } from '../../domain/status'

/** The answer first: effective status for the selected vehicle, with the two decisions behind it. */
export function EffectiveBanner({ site, vehicle, status }: { site: SiteDetailView; vehicle: Vehicle; status: StatusKey }) {
  const v = statusVisual(status)
  const stop = status === 'STOP_WORK'
  return (
    <section
      aria-label="Effective status"
      className={cx('relative flex flex-wrap items-center gap-x-6 gap-y-3 overflow-hidden rounded-[4px] border-2 py-4 pr-6', TONE_SOFT[v.tone], stop ? 'pl-10' : 'pl-6')}
    >
      {stop && <span aria-hidden className="absolute inset-y-0 left-0 w-5 hazard-stripes" />}
      <div className="flex flex-col gap-2">
        <p className="text-[0.8rem] text-muted label-caps">Effective status · {VEHICLE_LABEL[vehicle]}</p>
        <StatusTag status={status} size="xl" emphasize={stop} />
      </div>
      <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
        <p className="text-xl font-semibold">{v.hint}</p>
        <p className="text-muted">
          Weather {weatherVisual(site.weather_state).label} · access for {VEHICLE_LABEL[vehicle].toLowerCase()}{' '}
          {accessVisual(site.access_call[vehicle]).label} · planning recommendation, supervisor confirms
        </p>
      </div>
    </section>
  )
}
