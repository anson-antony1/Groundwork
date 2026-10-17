import { Bot, Check, X } from 'lucide-react'
import { hasEndpoint } from '../api/config'
import { describeError } from '../api/errors'
import { PROPOSED_ENDPOINTS } from '../api/proposed'
import type { ReportView } from '../api/proposed'
import { useReviewReport } from '../api/queries'
import { REPORT_CATEGORIES } from '../api/types'
import type { ReportCategory } from '../api/types'
import { categoryLabel } from '../domain/format'

const BUTTON = 'flex min-h-10 items-center gap-1.5 rounded-[3px] border px-2.5 text-[0.8rem] label-caps disabled:opacity-50'

/**
 * Supervisor review of a crew report: one click to accept the AI's suggested tag, confirm the crew's own
 * label, pick another category, or reject. Shown only when the backend serves the (proposed) review endpoint.
 */
export function ReportReview({ report }: { report: ReportView }) {
  const review = useReviewReport()
  if (report.verification !== 'unreviewed') return null
  if (!hasEndpoint(PROPOSED_ENDPOINTS.reportReview)) {
    return <p className="text-[0.78rem] text-muted">Review controls appear once the backend adds report review.</p>
  }
  const send = (verification: 'confirmed' | 'rejected', category?: ReportCategory) =>
    review.mutate({ reportId: report.id, input: category ? { verification, category_user: category } : { verification } })
  const aiDiffers = report.category_ai !== null && report.category_ai !== undefined && report.category_ai !== report.category_user

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {aiDiffers && (
          <button type="button" disabled={review.isPending} onClick={() => send('confirmed', report.category_ai!)} className={`${BUTTON} border-accent text-accent hover:bg-accent/10`}>
            <Bot aria-hidden className="size-4" /> Use AI tag: {categoryLabel(report.category_ai)}
          </button>
        )}
        <button type="button" disabled={review.isPending} onClick={() => send('confirmed')} className={`${BUTTON} border-line-hi hover:bg-steel-hi`}>
          <Check aria-hidden className="size-4" /> {aiDiffers ? 'Keep crew label' : 'Confirm'}
        </button>
        <select
          aria-label="Correct the category"
          disabled={review.isPending}
          value=""
          onChange={(e) => e.target.value && send('confirmed', e.target.value as ReportCategory)}
          className="min-h-10 rounded-[3px] border border-line-hi bg-bg px-2 text-[0.8rem]"
        >
          <option value="">Change to…</option>
          {REPORT_CATEGORIES.filter((c) => c !== report.category_user).map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <button type="button" disabled={review.isPending} onClick={() => send('rejected')} className={`${BUTTON} border-line-hi text-muted hover:bg-steel-hi`}>
          <X aria-hidden className="size-4" /> Reject
        </button>
      </div>
      {review.isError && <p className="text-[0.8rem] text-caution">Review not saved: {describeError(review.error)}</p>}
    </div>
  )
}
