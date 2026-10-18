import { ArrowRight, Camera, ChevronDown, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import type { SiteView } from '../../api/proposed'
import { usePrefetchSite } from '../../api/queries'
import type { Vehicle } from '../../api/types'
import { beaconMarkerSvg, markerSvg, reportPinSvg } from '../../components/markerSvg'
import { MissingValue } from '../../components/Provenance'
import { StatusMarker } from '../../components/StatusMarker'
import { StatusTag, WeatherTag } from '../../components/StatusTag'
import { siteTagTransition } from '../../components/viewTransitionNav'
import { VEHICLE_LABEL, fieldLabel, fmtNum } from '../../domain/format'
import { inputsSummary } from '../../domain/inputs'
import { statusVisual } from '../../domain/status'
import type { StatusKey } from '../../domain/status'

function Svg({ html }: { html: string }) {
  return <span className="inline-flex w-7 shrink-0 justify-center" dangerouslySetInnerHTML={{ __html: html }} />
}

/** Statuses grouped by what causes them, so STOP vs NO-GO and MATS vs REVIEW read as different questions. */
const LEGEND_GROUPS: readonly { title: string; scope?: string; statuses: readonly StatusKey[] }[] = [
  { title: 'Weather', scope: 'every vehicle', statuses: ['STOP_WORK'] },
  { title: 'Ground', scope: 'this vehicle', statuses: ['GO_FOR_REVIEW', 'MATS_FOR_REVIEW', 'NO_GO_FOR_REVIEW'] },
  { title: 'Needs a person', statuses: ['SUPERVISOR_REVIEW', 'UNKNOWN'] },
]

export function MapLegend({ vehicle }: { vehicle: Vehicle }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="absolute bottom-7 left-3 z-[1000] max-h-[calc(100%-4rem)] w-[23rem] overflow-y-auto rounded-[4px] border border-line-hi bg-panel/95 px-3.5 py-2.5 text-[0.82rem] shadow-[0_10px_26px_rgb(0_0_0/0.5)]">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-muted label-caps">
        Legend · {VEHICLE_LABEL[vehicle]}
        <ChevronDown aria-hidden className={open ? 'size-4 rotate-180' : 'size-4'} />
      </button>
      {open && (
        <>
          {LEGEND_GROUPS.map((g) => (
            <div key={g.title} className="mt-2 border-t border-line pt-2 first-of-type:border-t-0 first-of-type:pt-0">
              <p className="text-[0.78rem] font-semibold text-ink label-caps">
                {g.title}
                {g.scope && <span className="font-normal text-muted"> · {g.scope}</span>}
              </p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {g.statuses.map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <StatusMarker status={s} size={20} />
                    <span>
                      <span className="font-semibold">{statusVisual(s).short}</span>
                      <span className="text-muted"> · {statusVisual(s).hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-2 border-t border-line pt-2 text-muted">
            Score /10 = tomorrow’s weather risk only (0 calm, 10 severe). The color is the overall call, so soft ground can make a site amber or red even when its
            weather score is low. A supervisor makes the final call.
          </p>
          <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-line pt-2.5 text-muted">
            <li className="flex items-center gap-2">
              <Svg html={markerSvg('octagon', 'stop', { size: 22, hatched: true })} /> Hatched: historical replay
            </li>
            <li className="flex items-center gap-2">
              <Svg html={markerSvg('triangle', 'caution', { size: 22, dashed: true })} /> Dashed outline: simulated
            </li>
            <li className="flex items-center gap-2">
              <Svg html={beaconMarkerSvg('go', 22)} /> Demo sensor (tray at the venue)
            </li>
            <li className="flex items-center gap-2">
              <Svg html={reportPinSvg(1).replace('width="40" height="32"', 'width="26" height="21"')} /> Crew report · unverified
            </li>
          </ul>
        </>
      )}
    </div>
  )
}

interface PreviewProps {
  site: SiteView
  status: StatusKey
  stale: boolean
  reportCount: number
  onClose: () => void
}

export function SitePreview({ site, status, stale, reportCount, onClose }: PreviewProps) {
  const inputs = inputsSummary(site)
  const vehicleStatus = (v: Vehicle) => (stale ? 'STALE' : site.effective_status[v])
  usePrefetchSite(site.id)
  return (
    <div className="absolute right-3 bottom-7 z-[1000] w-[23rem] rounded-[4px] border border-line-hi bg-panel/95 p-4 shadow-[0_14px_32px_rgb(0_0_0/0.55)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold">{site.name}</p>
          <p className="text-[0.82rem] text-muted">
            {site.region ?? 'No region'} · {site.id}
          </p>
        </div>
        <button type="button" aria-label="Close preview" onClick={onClose} className="rounded-[3px] p-1 text-muted hover:bg-steel-hi hover:text-ink">
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="mt-3">
        <StatusTag status={status} size="lg" pulseOnChange viewTransitionName={siteTagTransition(site.id)} />
      </div>
      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 text-[0.85rem]">
        <div className="flex flex-col gap-1">
          <dt className="text-muted label-caps">Weather</dt>
          <dd>
            <WeatherTag state={stale ? 'UNKNOWN' : site.weather_state} size="sm" />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted label-caps">Weather risk</dt>
          <dd className="font-display text-xl font-bold">{site.hazard_score === null || site.hazard_score === undefined ? <MissingValue what="hazard score" /> : `${fmtNum(site.hazard_score)} / 10`}</dd>
        </div>
        {(['pickup', 'heavy_truck'] as const).map((v) => (
          <div key={v} className="flex flex-col gap-1">
            <dt className="text-muted label-caps">{VEHICLE_LABEL[v]}</dt>
            <dd>
              <StatusTag status={vehicleStatus(v)} compact size="sm" />
            </dd>
          </div>
        ))}
      </dl>
      {inputs.missing.length > 0 && (
        <p className="mt-3 text-[0.82rem] text-unknown">Missing: {inputs.missing.map(fieldLabel).join(', ')}</p>
      )}
      {reportCount > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.85rem]">
          <Camera aria-hidden className="size-4" /> {reportCount} crew report{reportCount > 1 ? 's' : ''} · unverified
        </p>
      )}
      <Link href={`/sites/${site.id}`} transition className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-[3px] bg-accent text-accent-ink label-caps">
        Open site detail <ArrowRight aria-hidden className="size-5" />
      </Link>
    </div>
  )
}
