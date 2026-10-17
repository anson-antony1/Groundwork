import { Cable, CircleCheckBig, CircleHelp, CloudLightning, Footprints, ImagePlus, Loader2, MapPinned, Route, Send, ThermometerSun, Trash2, TreePine, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import { DEMO_SITE_ID } from '../../api/config'
import { ApiError, describeError } from '../../api/errors'
import type { ReportView } from '../../api/proposed'
import { useCreateReport, useSites } from '../../api/queries'
import { REPORT_CATEGORIES } from '../../api/types'
import type { ReportCategory } from '../../api/types'
import { cx } from '../../components/cx'
import { ReportCard } from '../../components/ReportCard'
import { categoryLabel } from '../../domain/format'
import { useNow } from '../../hooks/useNow'
import { formatBytes, preparePhoto } from './photo'
import type { PreparedPhoto } from './photo'

const CATEGORY_ICON: Record<ReportCategory, LucideIcon> = {
  standing_water: Waves,
  mud: Footprints,
  flooded_road: Route,
  fallen_tree: TreePine,
  overhead_hazard: Cable,
  lightning_observed: CloudLightning,
  heat: ThermometerSun,
  other: CircleHelp,
}

const MAX_DESCRIPTION = 500

function Step({ n, title, children, optional }: { n: number; title: string; children: ReactNode; optional?: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2.5 text-lg label-caps">
        <span className="flex size-7 items-center justify-center rounded-full bg-ink text-sm text-bg">{n}</span>
        {title}
        {optional && <span className="text-[0.8rem] text-faint">optional</span>}
      </h2>
      {children}
    </section>
  )
}

/** Explains a failed upload in crew terms, using the backend's field details where it gave them. */
function uploadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return 'The photo is over 5 MB. Choose a smaller one.'
    if (error.status === 415) return 'The photo must be a JPEG or PNG.'
    if (error.status === 404) return 'That site no longer exists. Pick another.'
    if (error.status === 422 && error.details.length) return error.details.map((d) => `${d.field ?? 'form'}: ${d.issue}`).join('; ')
  }
  return describeError(error)
}

/** Crew hazard report, built for a phone in one hand (README §7): photo + description + category → map pin. */
export function ReportScreen({ siteId }: { siteId?: string }) {
  const sites = useSites().data?.data ?? []
  const create = useCreateReport()
  const now = useNow(1000)
  const [site, setSite] = useState(siteId ?? DEMO_SITE_ID)
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [sent, setSent] = useState<ReportView | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Free the preview's memory when it's replaced or the screen closes.
  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.previewUrl) : undefined), [photo])

  const text = description.trim()
  const ready = Boolean(site) && category !== null && text.length > 0 && !preparing

  async function onFile(file: File | undefined) {
    setPhotoError(null)
    if (!file) return
    setPreparing(true)
    try {
      setPhoto(await preparePhoto(file))
    } catch (error) {
      setPhoto(null)
      setPhotoError(error instanceof Error ? error.message : 'That photo could not be used.')
    } finally {
      setPreparing(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function submit() {
    if (!ready || !category) return
    create.mutate(
      { site_id: site, description: text, category_user: category, photo: photo?.blob ?? null },
      {
        onSuccess: (env) => {
          setSent(env.data)
          setDescription('')
          setCategory(null)
          setPhoto(null)
        },
      },
    )
  }

  const siteName = sites.find((s) => s.id === site)?.name ?? site

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-3 rounded-[4px] border-2 border-ink bg-steel p-6 text-center">
          <CircleCheckBig aria-hidden className="size-14 text-ink" />
          <p className="font-display text-3xl font-bold uppercase">Report sent</p>
          <p className="text-lg">It's on the map now, marked unverified until a supervisor reviews it.</p>
        </div>
        <ReportCard report={sent} now={now} />
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setSent(null)} className="min-h-14 rounded-[4px] bg-accent text-lg text-accent-ink label-caps">
            Send another
          </button>
          <Link href={`/sites/${sent.site_id}`} className="flex min-h-14 items-center justify-center rounded-[4px] border-2 border-ink text-lg label-caps">
            View site
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-7 pb-28"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <header>
        <h1 className="font-display text-4xl leading-none font-bold tracking-wide uppercase">Report a hazard</h1>
        <p className="mt-2 text-muted">Crew reports appear on the map right away. They flag a site for review; they never set its status.</p>
      </header>

      <Step n={1} title="Site">
        <label className="flex items-center gap-3 rounded-[4px] border-2 border-line-hi bg-bg px-3 focus-within:border-accent">
          <MapPinned aria-hidden className="size-6 shrink-0 text-muted" />
          <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site" className="min-h-14 w-full bg-transparent text-lg outline-none">
            {sites.length === 0 && <option value={site}>{site}</option>}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </label>
      </Step>

      <Step n={2} title="Photo" optional>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          className="sr-only"
          id="report-photo"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {photo ? (
          <div className="flex gap-4 rounded-[4px] border border-line bg-steel p-3">
            <img src={photo.previewUrl} alt="Selected hazard photo" className="size-28 rounded-[3px] object-cover" />
            <div className="flex flex-col justify-between gap-2 text-[0.9rem]">
              <p>
                Ready · {formatBytes(photo.blob.size)} JPEG
                <span className="block text-muted">Location data removed from the photo.</span>
              </p>
              <button type="button" onClick={() => setPhoto(null)} className="flex min-h-11 items-center gap-2 self-start rounded-[3px] border border-line-hi px-3 label-caps">
                <Trash2 aria-hidden className="size-4" /> Remove
              </button>
            </div>
          </div>
        ) : (
          <label htmlFor="report-photo" className="flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-[4px] border-2 border-dashed border-line-hi text-lg label-caps hover:border-accent">
            {preparing ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <ImagePlus aria-hidden className="size-7" />}
            {preparing ? 'Preparing photo…' : 'Take or choose a photo'}
          </label>
        )}
        {photoError && (
          <p role="alert" className="text-caution">
            {photoError}
          </p>
        )}
        <p className="text-[0.82rem] text-muted">JPEG or PNG. Large photos are resized to stay under 5 MB.</p>
      </Step>

      <Step n={3} title="What did you see?">
        <div role="radiogroup" aria-label="Hazard category" className="grid grid-cols-2 gap-2.5">
          {REPORT_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c]
            const on = category === c
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCategory(c)}
                className={cx(
                  'flex min-h-16 items-center gap-2.5 rounded-[4px] border-2 px-3 text-left text-[1.02rem] font-semibold',
                  on ? 'border-accent bg-accent/15 text-ink' : 'border-line-hi text-ink hover:border-line-hi hover:bg-steel',
                )}
              >
                <Icon aria-hidden className={cx('size-6 shrink-0', on ? 'text-accent' : 'text-muted')} />
                {categoryLabel(c)}
              </button>
            )
          })}
        </div>
      </Step>

      <Step n={4} title="Describe it">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
          rows={4}
          required
          aria-label="Description"
          placeholder="e.g. Standing water near the southern gate, about ankle deep"
          className="rounded-[4px] border-2 border-line-hi bg-bg p-3 text-lg outline-none placeholder:text-faint focus:border-accent"
        />
        <p className="text-right text-[0.8rem] text-muted num">
          {description.length} / {MAX_DESCRIPTION}
        </p>
      </Step>

      {create.isError && (
        <p role="alert" className="rounded-[3px] border border-caution/60 bg-caution/10 p-3 text-caution">
          Not sent: {uploadError(create.error)}
        </p>
      )}

      {/* Sticky send bar: reachable with a thumb at the bottom of a phone screen. */}
      <div className="fixed inset-x-0 bottom-0 z-[1200] border-t-2 border-line bg-panel px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[0.85rem] text-muted">
            {ready ? `To ${siteName}` : category === null ? 'Pick what you saw' : 'Add a short description'}
          </p>
          <button
            type="submit"
            disabled={!ready || create.isPending}
            className="flex min-h-14 items-center gap-2 rounded-[4px] bg-accent px-6 text-lg text-accent-ink label-caps disabled:opacity-40"
          >
            {create.isPending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Send aria-hidden className="size-5" />}
            {create.isPending ? 'Sending' : 'Send report'}
          </button>
        </div>
      </div>
    </form>
  )
}
