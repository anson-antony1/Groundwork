import { Bot, Camera, CircleCheck, CircleX, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { assetUrl } from '../api/config'
import type { ReportView } from '../api/proposed'
import { categoryLabel, fmtAgo, fmtWhen } from '../domain/format'
import { LABELS } from '../domain/provenance'
import { cx } from './cx'

const VERIFICATION: Record<ReportView['verification'], { label: string; icon: typeof Clock; className: string }> = {
  unreviewed: { label: 'Unreviewed', icon: Clock, className: 'border-dashed border-line-hi text-muted' },
  confirmed: { label: 'Confirmed by supervisor', icon: CircleCheck, className: 'border-line-hi text-ink' },
  rejected: { label: 'Rejected by supervisor', icon: CircleX, className: 'border-line-hi text-muted line-through decoration-1' },
}

/** The advisory AI tag. Never a status: it's labeled as unverified and the crew's own label leads. */
export function AiTag({ report }: { report: ReportView }) {
  if (report.category_ai) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[3px] border border-dashed border-accent/60 px-2 py-1 text-[0.82rem]">
        <Bot aria-hidden className="size-4 text-accent" />
        <span className="text-accent label-caps">{LABELS.aiTagReview}</span>
        <span className="font-semibold">
          {categoryLabel(report.category_ai)}
          {report.ai_confidence != null && ` (${Math.round(report.ai_confidence * 100)}%)`}
        </span>
      </span>
    )
  }
  const pending = report.ai_status === 'pending'
  return (
    <span className="inline-flex items-center gap-2 rounded-[3px] border border-dashed border-line-hi px-2 py-1 text-[0.82rem] text-muted">
      <Bot aria-hidden className="size-4" />
      {pending ? 'AI suggestion pending…' : 'AI suggestion unavailable'}
    </span>
  )
}

export function VerificationChip({ verification }: { verification: ReportView['verification'] }) {
  const v = VERIFICATION[verification]
  const Icon = v.icon
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[0.74rem] label-caps', v.className)}>
      <Icon aria-hidden className="size-3.5" />
      {v.label}
    </span>
  )
}

interface ReportCardProps {
  report: ReportView
  now: number
  /** Review controls (Confirm / Change / Reject) when the review endpoint exists. */
  actions?: ReactNode
  className?: string
}

/** A crew hazard report: reported, unverified until a supervisor reviews it (README §7, P10). */
export function ReportCard({ report, now, actions, className }: ReportCardProps) {
  const image = assetUrl(report.image_url)
  return (
    <article className={cx('flex gap-4 rounded-[4px] border border-line bg-steel/50 p-3.5', className)}>
      {image ? (
        <img src={image} alt={`Crew photo: ${report.description}`} className="size-24 shrink-0 rounded-[3px] border border-line object-cover" />
      ) : (
        <span className="flex size-24 shrink-0 flex-col items-center justify-center gap-1 rounded-[3px] border border-dashed border-line text-[0.72rem] text-faint">
          <Camera aria-hidden className="size-5" /> No photo
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-[3px] bg-ink px-2 py-0.5 text-[0.78rem] text-bg label-caps">Crew: {categoryLabel(report.category_user)}</span>
          <VerificationChip verification={report.verification} />
        </div>
        <p className="leading-snug">{report.description}</p>
        <AiTag report={report} />
        <p className="text-[0.78rem] text-muted" title={fmtWhen(report.reported_at)}>
          Reported {fmtAgo(report.reported_at, now)} · crew report, not an official alert
        </p>
        {actions}
      </div>
    </article>
  )
}
