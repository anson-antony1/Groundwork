import { useLayoutEffect, useRef } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { cx } from './cx'

/** The characters on each card, in flip order. */
const CARDS = ' 0123456789'
const NBSP = String.fromCharCode(160)

/** Cards a unit passes on the way from `from` to `to`, like a real departures board (at most four). */
function cardsBetween(from: string, to: string): string[] {
  let i = CARDS.indexOf(from)
  const j = CARDS.indexOf(to)
  if (i < 0 || j < 0) return [to]
  const out: string[] = []
  while (i !== j) {
    i = (i + 1) % CARDS.length
    out.push(CARDS[i])
  }
  return out.slice(-4)
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * Drives one unit's four faces directly: static top and bottom halves, plus two leaves that fold.
 * Values can arrive faster than flips finish; a newer value cancels the flip in progress.
 */
class FlapDriver {
  private shown: string | null = null
  private version = 0
  private running: Animation[] = []
  private readonly top: HTMLElement
  private readonly bottom: HTMLElement
  private readonly leafTop: HTMLElement
  private readonly leafBottom: HTMLElement

  constructor(unit: HTMLElement) {
    const [top, bottom, leafTop, leafBottom] = Array.from(unit.children) as HTMLElement[]
    this.top = top
    this.bottom = bottom
    this.leafTop = leafTop
    this.leafBottom = leafBottom
  }

  private write(face: HTMLElement, ch: string): void {
    const glyph = face.firstElementChild
    if (glyph) glyph.textContent = ch === ' ' ? NBSP : ch
  }

  /** Every face shows `ch` and the leaves are put away. */
  private rest(ch: string): void {
    this.running.forEach((animation) => animation.cancel())
    this.running = []
    for (const face of [this.top, this.bottom, this.leafTop, this.leafBottom]) this.write(face, ch)
    this.leafTop.style.visibility = 'hidden'
    this.leafBottom.style.visibility = 'hidden'
    this.shown = ch
  }

  async show(ch: string, animate: boolean, delayMs: number): Promise<void> {
    const version = ++this.version
    if (this.shown === null || this.shown === ch || !animate || typeof this.top.animate !== 'function') {
      this.rest(ch)
      return
    }
    await wait(delayMs)
    if (version !== this.version || this.shown === null) return
    const cards = cardsBetween(this.shown, ch)
    const duration = cards.length > 1 ? 70 : 140
    for (const card of cards) {
      if (version !== this.version || !(await this.flip(card, duration))) return
    }
  }

  private async flip(to: string, duration: number): Promise<boolean> {
    const from = this.shown ?? ' '
    this.running.forEach((animation) => animation.cancel())
    // The new top waits under the old top leaf; the new bottom arrives on the falling leaf.
    this.write(this.top, to)
    this.write(this.leafBottom, to)
    this.write(this.leafTop, from)
    this.write(this.bottom, from)
    this.leafTop.style.visibility = 'visible'
    this.leafBottom.style.visibility = 'visible'
    const fold = this.leafTop.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], { duration, easing: 'ease-in', fill: 'forwards' })
    const drop = this.leafBottom.animate(
      [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(90deg)', offset: 0.5 }, { transform: 'rotateX(0deg)' }],
      { duration: duration * 2, easing: 'ease-out', fill: 'forwards' },
    )
    this.running = [fold, drop]
    try {
      await drop.finished
    } catch {
      return false // a newer value cancelled this flip
    }
    this.rest(to)
    return true
  }
}

function FlapUnit({ ch, delayMs }: { ch: string; delayMs: number }) {
  const reduced = useReducedMotion()
  const unit = useRef<HTMLSpanElement>(null)
  const driver = useRef<FlapDriver | null>(null)
  useLayoutEffect(() => {
    if (!unit.current) return
    driver.current ??= new FlapDriver(unit.current)
    void driver.current.show(ch, !reduced, delayMs)
  }, [ch, reduced, delayMs])
  return (
    <span ref={unit} className="gw-flap">
      <span className="gw-flap-top">
        <b />
      </span>
      <span className="gw-flap-bottom">
        <b />
      </span>
      <span className="gw-flap-leaf-top">
        <b />
      </span>
      <span className="gw-flap-leaf-bottom">
        <b />
      </span>
    </span>
  )
}

/**
 * Text (usually a formatted number) on split-flap cards that flip when a character changes, like a
 * departures board. It mounts already showing its value, and the real text stays in the accessible
 * name. Digits and spaces get cards; other characters ("." or "/") sit between them. Pad numbers
 * with spaces (e.g. " 3") so a change from 3 to 61 flips a blank card instead of adding one.
 */
export function SplitFlap({ text, className }: { text: string; className?: string }) {
  const chars = [...text]
  return (
    <span className={cx('gw-flapset num', className)}>
      <span className="sr-only">{text.trim()}</span>
      <span aria-hidden className="gw-flap-row">
        {chars.map((ch, i) => {
          // Keyed from the right, so the ones card keeps its identity when the length changes.
          const place = chars.length - 1 - i
          return CARDS.includes(ch) ? (
            <FlapUnit key={`card-${place}`} ch={ch} delayMs={i * 60} />
          ) : (
            <span key={`sep-${place}`} className="gw-flap-sep">
              {ch}
            </span>
          )
        })}
      </span>
    </span>
  )
}

/** A count on split-flap cards, padded to `width` cards. */
export function FlapCount({ value, width = 2, className }: { value: number; width?: number; className?: string }) {
  return <SplitFlap text={String(Math.round(value)).padStart(width, ' ')} className={className} />
}
