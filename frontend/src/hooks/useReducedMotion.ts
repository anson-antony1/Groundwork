import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/** Without matchMedia (jsdom, very old browsers) nothing animates, so tests stay deterministic. */
function snapshot(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : true
}

/**
 * True when the viewer asks for less motion. The CSS rule in theme.css already flattens CSS
 * animations and transitions; JavaScript-driven motion (rAF loops, WAAPI) must check this itself.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true)
}
