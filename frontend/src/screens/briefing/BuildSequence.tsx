import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cx } from '../../components/cx'

/** What the backend does to build a plan, in order. The last step is the slow Gemini call. */
const STEPS = [
  'Ranking every site for tomorrow',
  'Checking NWS alerts and the weather snapshot',
  'Working out mat ranges and the cost of waiting',
  'Writing the narrative with Gemini',
]
/** Seconds when each step starts. The last one stays open until the plan arrives (about 20 s). */
const STARTS = [0, 1.2, 2.6, 4]

/**
 * Shown while POST /briefings/generate runs: a stopwatch and the backend's steps. The steps pace
 * themselves as an estimate; the last finishes only when the response lands, and the panel unmounts.
 */
export function BuildSequence() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = performance.now()
    const timer = window.setInterval(() => setElapsed((performance.now() - started) / 1000), 200)
    return () => window.clearInterval(timer)
  }, [])

  let current = 0
  for (let i = 0; i < STARTS.length; i++) if (elapsed >= STARTS[i]) current = i
  const seconds = Math.floor(elapsed)

  return (
    <section role="status" aria-label="Building the 6 PM plan" className="flex flex-wrap items-center gap-x-10 gap-y-5 rounded-[4px] border border-line-hi bg-panel px-6 py-5">
      <div className="flex flex-col items-center gap-2">
        <svg viewBox="-50 -50 100 100" aria-hidden className="size-24">
          <circle r="46" fill="#14181c" stroke="var(--color-line-hi)" strokeWidth="2" />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="0" y1="-44" x2="0" y2="-38" stroke="var(--color-muted)" strokeWidth="1.6" transform={`rotate(${i * 30})`} />
          ))}
          {/* One turn per 30 s: Gemini usually answers before the hand comes round. */}
          <line x1="0" y1="7" x2="0" y2="-36" stroke="var(--color-ink)" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${((elapsed % 30) / 30) * 360})`} />
          <circle r="3.4" fill="var(--color-ink)" />
        </svg>
        <span className="font-display text-xl font-bold num">0:{String(seconds).padStart(2, '0')}</span>
      </div>
      <ol className="flex min-w-0 flex-1 flex-col gap-3">
        {STEPS.map((step, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={step} className={cx('flex items-center gap-3 text-lg', done ? 'text-muted' : active ? 'font-semibold text-ink' : 'text-faint')}>
              <span
                aria-hidden
                className={cx(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                  done ? 'border-ink bg-ink text-bg' : active ? 'animate-spin border-line-hi border-t-ink' : 'border-line-hi',
                )}
              >
                {done && <Check className="size-4" strokeWidth={3} />}
              </span>
              {step}
              {active && i === STEPS.length - 1 && elapsed > 8 && <span className="text-[0.95rem] font-normal text-muted">· usually about 20 s</span>}
            </li>
          )
        })}
      </ol>
      <p className="basis-full text-[0.9rem] text-muted">
        If Gemini is slow or fails, the deterministic version is used automatically. Tip: generate before the demo and show the saved plan.
      </p>
    </section>
  )
}
