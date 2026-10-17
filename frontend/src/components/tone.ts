// Tailwind classes per status tone. Kept as full static strings so Tailwind's scanner finds them.
import type { Tone } from '../domain/status'

/** Solid placard: status fill with contrasting text (UNKNOWN is a dashed outline, never a fill). */
export const TONE_SOLID: Record<Tone, string> = {
  go: 'bg-go text-go-ink border-go',
  caution: 'bg-caution text-caution-ink border-caution',
  nogo: 'bg-nogo text-nogo-ink border-nogo',
  stop: 'bg-stop text-stop-ink border-stop',
  unknown: 'bg-transparent text-unknown border-unknown border-dashed',
}

/** Status-colored text on dark surfaces. */
export const TONE_TEXT: Record<Tone, string> = {
  go: 'text-go',
  caution: 'text-caution',
  nogo: 'text-nogo-text',
  stop: 'text-stop-glow',
  unknown: 'text-unknown',
}

export const TONE_BORDER: Record<Tone, string> = {
  go: 'border-go',
  caution: 'border-caution',
  nogo: 'border-nogo',
  stop: 'border-stop',
  unknown: 'border-unknown border-dashed',
}

/** Tinted surface for banners and highlighted cards. */
export const TONE_SOFT: Record<Tone, string> = {
  go: 'bg-go/10 border-go/70',
  caution: 'bg-caution/10 border-caution/70',
  nogo: 'bg-nogo/15 border-nogo/80',
  stop: 'bg-stop/20 border-stop',
  unknown: 'bg-unknown/5 border-unknown/60 border-dashed',
}

/** CSS color for SVG fills (markers, gauges). */
export const TONE_VAR: Record<Tone, string> = {
  go: 'var(--color-go)',
  caution: 'var(--color-caution)',
  nogo: 'var(--color-nogo)',
  stop: 'var(--color-stop)',
  unknown: 'var(--color-unknown)',
}
