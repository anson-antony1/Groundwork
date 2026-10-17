import type { ReactNode } from 'react'
import type { Tone } from '../domain/status'
import { cx } from './cx'
import { TONE_BORDER } from './tone'

interface CardProps {
  title?: ReactNode
  icon?: ReactNode
  /** Right side of the title bar (badges, toggles). */
  right?: ReactNode
  /** Provenance line or note under the body. */
  footer?: ReactNode
  /** Adds a status-colored left edge. */
  tone?: Tone
  className?: string
  bodyClassName?: string
  children?: ReactNode
}

/** Steel panel with an uppercase title bar: the building block of every screen. */
export function Card({ title, icon, right, footer, tone, className, bodyClassName, children }: CardProps) {
  return (
    <section
      className={cx(
        'flex flex-col rounded-[4px] border border-line bg-panel shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_10px_28px_rgb(0_0_0/0.35)]',
        tone && cx('border-l-[5px]', TONE_BORDER[tone]),
        className,
      )}
    >
      {(title || right) && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-line bg-gradient-to-b from-steel-hi/50 to-transparent px-5 py-2.5">
          <h2 className="flex items-center gap-2 text-[0.8rem] text-muted label-caps">
            {icon}
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className={cx('flex-1 p-5', bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-line px-5 py-2.5 text-[0.78rem] text-muted">{footer}</footer>}
    </section>
  )
}
