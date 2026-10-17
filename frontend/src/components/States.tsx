import { Clock, Loader2, RotateCw, ServerCrash } from 'lucide-react'
import type { ReactNode } from 'react'
import { describeError } from '../api/errors'
import { fmtClock } from '../domain/format'
import { cx } from './cx'

export function LoadingBlock({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" className={cx('flex items-center justify-center gap-3 p-8 text-muted', className)}>
      <Loader2 aria-hidden className="size-6 animate-spin" />
      <span className="label-caps">{label}</span>
    </div>
  )
}

/** A request failed. Neutral styling: an outage is not a site status. */
export function ErrorBlock({ title, error, onRetry, className }: { title: string; error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cx('flex flex-col items-start gap-3 rounded-[4px] border-2 border-dashed border-line-hi bg-steel/60 p-6', className)}>
      <p className="flex items-center gap-2.5 text-lg font-semibold">
        <ServerCrash aria-hidden className="size-6 text-muted" />
        {title}
      </p>
      <p className="text-muted">{describeError(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="flex min-h-11 items-center gap-2 rounded-[3px] bg-accent px-4 text-accent-ink label-caps">
          <RotateCw aria-hidden className="size-4" /> Retry
        </button>
      )}
    </div>
  )
}

export function EmptyBlock({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-start gap-1.5 rounded-[4px] border border-dashed border-line p-5 text-muted', className)}>
      <p className="font-semibold text-ink">{title}</p>
      {/* One wrapper, so inline children (text with <strong> or a link) stay one flowing line, not flex items. */}
      {children != null && <div>{children}</div>}
    </div>
  )
}

/** Shown when a view's data is too old: statuses below are withheld (rendered as STALE), never shown green. */
export function StaleBanner({ updatedAt, what, className }: { updatedAt: number; what: string; className?: string }) {
  return (
    <div role="status" className={cx('flex flex-wrap items-center gap-2.5 rounded-[4px] border-2 border-dashed border-unknown/70 bg-unknown/5 px-4 py-2.5', className)}>
      <Clock aria-hidden className="size-5 text-unknown" />
      <span className="text-unknown label-caps">Stale</span>
      <span>
        {what} last updated {fmtClock(new Date(updatedAt).toISOString())}. Statuses are hidden until fresh data arrives.
      </span>
    </div>
  )
}
