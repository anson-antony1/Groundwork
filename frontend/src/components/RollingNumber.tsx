import { cx } from './cx'

const DIGITS = ['\u00a0', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
/** Taller than the glyphs, so a neighbouring digit never peeks into the window. */
const CELL_EM = 1.15

/** One digit position: a strip of blank + 0-9 that slides to the current digit. Blank columns collapse. */
function DigitColumn({ ch, delayMs, durationMs }: { ch: string; delayMs: number; durationMs: number }) {
  const index = ch === ' ' ? 0 : Number(ch) + 1
  return (
    <span
      className="inline-block h-[1.15em] overflow-hidden transition-[width] duration-[420ms] ease-[cubic-bezier(.2,.8,.2,1)]"
      style={{ width: index === 0 ? 0 : '1ch' }}
    >
      <span
        className="block transition-transform ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ transform: `translateY(${-index * CELL_EM}em)`, transitionDuration: `${durationMs}ms`, transitionDelay: `${delayMs}ms` }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block h-[1.15em] leading-[1.15em]">
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

/**
 * A number that rolls like a mechanical counter when it changes. It mounts already showing its value
 * (nothing rolls on first render), and the real value stays in the accessible text. The global
 * reduced-motion rule in theme.css turns the roll into an instant change.
 */
export function RollingNumber({
  value,
  decimals = 0,
  minDigits = 1,
  durationMs = 700,
  className,
}: {
  value: number
  decimals?: number
  /** Digit columns kept for the integer part, so a 1-to-2-digit change rolls instead of jumping. */
  minDigits?: number
  /** Roll time per change. Shorten it for numbers that change several times a second. */
  durationMs?: number
  className?: string
}) {
  const text = Math.abs(value).toFixed(decimals)
  const [int, frac] = text.split('.')
  const chars = [...int.padStart(minDigits, ' '), ...(frac ? ['.', ...frac] : [])]
  return (
    <span className={cx('inline-flex items-start whitespace-nowrap num', className)}>
      <span className="sr-only">{value < 0 ? `-${text}` : text}</span>
      <span aria-hidden className="inline-flex items-start">
        {value < 0 && <span className="leading-[1.15em]">-</span>}
        {chars.map((ch, i) => {
          // Keyed by position from the right, so the ones column stays the same element as digits come and go.
          const place = chars.length - 1 - i
          return ch === '.' ? (
            <span key="dot" className="leading-[1.15em]">
              .
            </span>
          ) : (
            <DigitColumn key={place} ch={ch} delayMs={place * 45} durationMs={durationMs} />
          )
        })}
      </span>
    </span>
  )
}
