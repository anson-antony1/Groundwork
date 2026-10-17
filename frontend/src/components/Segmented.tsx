import type { KeyboardEvent, ReactNode } from 'react'
import { useRef } from 'react'
import { cx } from './cx'

interface Option<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
  size?: 'md' | 'lg'
  className?: string
}

/** Radio-group toggle with arrow-key support (used for Pickup ↔ Heavy truck). */
export function Segmented<T extends string>({ label, value, options, onChange, size = 'md', className }: SegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = options.findIndex((o) => o.value === value)
    const next = (i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx('inline-flex rounded-[4px] border-2 border-line-hi bg-bg p-1', className)}
    >
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex items-center gap-2 rounded-[2px] label-caps transition-colors',
              size === 'lg' ? 'min-h-14 px-5 text-lg' : 'min-h-10 px-3.5 text-[0.86rem]',
              selected ? 'bg-accent text-accent-ink shadow-[0_2px_0_rgb(0_0_0/0.4)]' : 'text-muted hover:bg-steel-hi hover:text-ink',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
