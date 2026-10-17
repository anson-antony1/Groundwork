import { statusVisual, weatherVisual } from '../domain/status'
import type { Tone } from '../domain/status'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { cx } from './cx'
import { TONE_SOLID, TONE_TEXT, TONE_VAR } from './tone'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const SIZE: Record<Size, string> = {
  sm: 'text-[0.72rem] px-2 py-1 gap-1.5',
  md: 'text-[0.86rem] px-2.5 py-1.5 gap-2',
  lg: 'text-lg px-3.5 py-2 gap-2.5',
  xl: 'text-3xl px-5 py-3 gap-3',
}

interface PlacardProps {
  tone: Tone
  icon: LucideIcon
  text: string
  hint: string
  size?: Size
  /** Pulse STOP placards; reserve it for one or two hero placards per screen. */
  emphasize?: boolean
  /** One ring in the status color when the status changes (never on first render). */
  pulseOnChange?: boolean
  /** Pairs this placard with one on another screen for the view-transition morph. */
  viewTransitionName?: string
  className?: string
}

/** Rings once in the tone's color whenever `key` changes after mount. */
function usePulseOnChange(enabled: boolean, key: string, tone: Tone) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef(key)
  const reduced = useReducedMotion()
  useEffect(() => {
    if (last.current === key) return
    last.current = key
    const el = ref.current
    if (!enabled || reduced || !el || typeof el.animate !== 'function') return
    el.animate(
      [
        { boxShadow: `0 0 0 0 color-mix(in srgb, ${TONE_VAR[tone]} 75%, transparent)` },
        { boxShadow: `0 0 0 14px color-mix(in srgb, ${TONE_VAR[tone]} 0%, transparent)` },
      ],
      { duration: 700, easing: 'ease-out' },
    )
  }, [enabled, key, tone, reduced])
  return ref
}

/** Equipment-placard tag: icon + uppercase label on a status fill. Color is never the only cue. */
export function Placard({ tone, icon: Icon, text, hint, size = 'md', emphasize, pulseOnChange = false, viewTransitionName, className }: PlacardProps) {
  const ref = usePulseOnChange(pulseOnChange, `${tone}|${text}`, tone)
  return (
    <span
      ref={ref}
      title={hint}
      style={viewTransitionName ? { viewTransitionName } : undefined}
      className={cx(
        'relative inline-flex shrink-0 items-center overflow-hidden rounded-[3px] border-2 leading-none whitespace-nowrap label-caps',
        TONE_SOLID[tone],
        SIZE[size],
        tone === 'stop' && 'pl-[1.1em]',
        tone === 'stop' && emphasize && 'animate-stop-pulse',
        className,
      )}
    >
      {tone === 'stop' && <span aria-hidden className="absolute inset-y-0 left-0 w-[0.6em] hazard-stripes" />}
      <Icon aria-hidden className="size-[1.15em] shrink-0" strokeWidth={2.6} />
      <span>{text}</span>
    </span>
  )
}

interface StatusTagProps {
  /** An effective status or access call from the API (or STALE / NO_LINK). */
  status: string | null | undefined
  size?: Size
  /** Use the short label ("MATS") instead of the full one ("MATS · FOR REVIEW"). */
  compact?: boolean
  emphasize?: boolean
  pulseOnChange?: boolean
  viewTransitionName?: string
  className?: string
}

export function StatusTag({ status, size, compact, emphasize, pulseOnChange, viewTransitionName, className }: StatusTagProps) {
  const v = statusVisual(status)
  return (
    <Placard
      tone={v.tone}
      icon={v.icon}
      text={compact ? v.short : v.label}
      hint={v.hint}
      size={size}
      emphasize={emphasize}
      pulseOnChange={pulseOnChange}
      viewTransitionName={viewTransitionName}
      className={className}
    />
  )
}

export function WeatherTag({ state, size, emphasize, className }: { state: string | null | undefined; size?: Size; emphasize?: boolean; className?: string }) {
  const v = weatherVisual(state)
  return <Placard tone={v.tone} icon={v.icon} text={v.label} hint={v.hint} size={size} emphasize={emphasize} className={className} />
}

/** Light inline weather indicator for dense rows, where a second placard would compete with the status. */
export function WeatherInline({ state, className }: { state: string | null | undefined; className?: string }) {
  const v = weatherVisual(state)
  const Icon = v.icon
  return (
    <span title={v.hint} className={cx('inline-flex items-center gap-1 text-[0.78rem] label-caps', TONE_TEXT[v.tone], className)}>
      <Icon aria-hidden className="size-[1.1em]" strokeWidth={2.4} />
      Weather · {v.label}
    </span>
  )
}
