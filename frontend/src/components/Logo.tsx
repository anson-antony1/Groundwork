import { cx } from './cx'

/** Groundwork mark: a site beacon broadcasting over ground strata. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cx('shrink-0', className)}>
      <rect width="64" height="64" rx="8" fill="#1f242a" />
      <path d="M22 20a14 14 0 0 1 20 0M17 14a21 21 0 0 1 30 0" fill="none" stroke="#4fb3d9" strokeWidth="4" strokeLinecap="round" />
      <rect x="26" y="25" width="12" height="13" rx="2" fill="#e8ecef" />
      <circle cx="32" cy="31" r="2.6" fill="#4fb3d9" />
      <rect x="9" y="42" width="46" height="5" rx="1" fill="#9aa6b2" />
      <rect x="9" y="50" width="46" height="5" rx="1" fill="#5d6873" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <LogoMark className="size-8 sm:size-9" />
      <span className="font-display text-[1.2rem] leading-none font-bold tracking-[0.1em] text-ink uppercase sm:text-[1.45rem] sm:tracking-[0.12em]">
        Groundwork
      </span>
    </span>
  )
}
