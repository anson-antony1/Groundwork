import { statusVisual, weatherVisual } from '../domain/status'
import type { Tone } from '../domain/status'
import type { LucideIcon } from 'lucide-react'
import { cx } from './cx'
import { TONE_SOLID } from './tone'

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
  className?: string
}

/** Equipment-placard tag: icon + uppercase label on a status fill. Color is never the only cue. */
export function Placard({ tone, icon: Icon, text, hint, size = 'md', emphasize, className }: PlacardProps) {
  return (
    <span
      title={hint}
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
  className?: string
}

export function StatusTag({ status, size, compact, emphasize, className }: StatusTagProps) {
  const v = statusVisual(status)
  return (
    <Placard
      tone={v.tone}
      icon={v.icon}
      text={compact ? v.short : v.label}
      hint={v.hint}
      size={size}
      emphasize={emphasize}
      className={className}
    />
  )
}

export function WeatherTag({ state, size, emphasize, className }: { state: string | null | undefined; size?: Size; emphasize?: boolean; className?: string }) {
  const v = weatherVisual(state)
  return <Placard tone={v.tone} icon={v.icon} text={v.label} hint={v.hint} size={size} emphasize={emphasize} className={className} />
}
