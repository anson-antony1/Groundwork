import { flushSync } from 'react-dom'
import type { AroundNavHandler } from 'wouter'

/**
 * Router hook for links marked `transition`: the change runs inside a View Transition, so a site's
 * status tag (view-transition-name "site-<id>") flies from the map preview into the detail banner
 * and back. Elsewhere, under reduced motion, or in browsers without the API it is a plain navigation.
 */
export const viewTransitionNav: AroundNavHandler = (navigate, to, options) => {
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!options?.transition || reduced || typeof document.startViewTransition !== 'function') {
    navigate(to, options)
    return
  }
  document.startViewTransition(() => {
    // Render the new route synchronously, so the transition captures it rather than a stale frame.
    flushSync(() => navigate(to, options))
  })
}

/** The shared view-transition-name for a site's status tag. */
export const siteTagTransition = (siteId: string) => `site-${siteId}`
