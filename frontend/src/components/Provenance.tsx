import { CircleSlash, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ObservationQuality } from '../api/types'
import { MISSING } from '../domain/format'
import { QUALITY_LABEL } from '../domain/provenance'
import { cx } from './cx'

const QUALITY_CLASS: Record<ObservationQuality, string> = {
  available: 'border-line-hi text-muted',
  stale: 'border-caution/70 text-caution',
  missing: 'border-dashed border-unknown/70 text-unknown',
  simulated: 'border-dashed border-line-hi text-muted',
  sensor_demo: 'border-accent/60 text-accent',
  sensor_replay: 'border-accent/60 text-accent',
}

/** Small source line: "Forecast/model data • Open-Meteo • valid Sat, Oct 17". */
export function ProvenanceLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('flex items-start gap-1.5 text-[0.78rem] leading-snug text-muted', className)}>
      <Info aria-hidden className="mt-[0.15em] size-[1em] shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** Data-quality chip: Available / Stale / Missing / Simulated / Demo sensor / Recorded demo. */
export function QualityChip({ quality, className }: { quality: ObservationQuality; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-[3px] border px-1.5 py-0.5 text-[0.7rem] leading-none label-caps',
        QUALITY_CLASS[quality],
        className,
      )}
    >
      {QUALITY_LABEL[quality]}
    </span>
  )
}

/** A value the API didn't provide. Reads as missing, never as zero. */
export function MissingValue({ what, className }: { what?: string; className?: string }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 text-unknown', className)}
      aria-label={what ? `${what}: value missing` : 'value missing'}
    >
      <CircleSlash aria-hidden className="size-[0.9em]" />
      <span className="border-b border-dashed border-unknown/70">{MISSING}</span>
    </span>
  )
}
