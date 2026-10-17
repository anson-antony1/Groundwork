import { useId } from 'react'
import { cx } from './cx'

interface NumberFieldProps {
  label: string
  /** Raw text, so a half-typed value ("1.") isn't clobbered while editing. */
  value: string
  onChange: (text: string) => void
  unit?: string
  prefix?: string
  step?: number
  error?: string | null
  className?: string
}

/** Large numeric input with a unit and an inline error. */
export function NumberField({ label, value, onChange, unit, prefix, step = 1, error, className }: NumberFieldProps) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-[0.75rem] text-muted label-caps">
        {label}
      </label>
      <div className={cx('flex items-center rounded-[3px] border-2 bg-bg focus-within:border-accent', error ? 'border-caution' : 'border-line-hi')}>
        {prefix && <span className="pl-2.5 text-muted">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-h-11 w-full min-w-0 bg-transparent px-2.5 text-[1.05rem] outline-none num"
        />
        {unit && <span className="pr-2.5 text-[0.85rem] whitespace-nowrap text-muted">{unit}</span>}
      </div>
      {error && (
        <span id={`${id}-error`} role="alert" className="text-[0.78rem] text-caution">
          {error}
        </span>
      )}
    </div>
  )
}
