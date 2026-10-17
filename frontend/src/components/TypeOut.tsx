import { useEffect, useState } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

const CHARS_PER_SECOND = 90

/**
 * Reveals text as if it were being typed, once. The full text is in the accessible name from the
 * start, and reduced motion shows it at once. Give it `key={text}` so new text starts over.
 */
export function TypeOut({ text, className }: { text: string; className?: string }) {
  const reduced = useReducedMotion()
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (reduced) return
    let raf = 0
    const started = performance.now()
    const tick = (now: number) => {
      const next = Math.min(text.length, Math.floor(((now - started) / 1000) * CHARS_PER_SECOND))
      setCount(next)
      if (next < text.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, reduced])

  const shown = reduced ? text.length : count
  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, shown)}
        {shown < text.length && <span className="gw-caret" />}
      </span>
    </p>
  )
}
