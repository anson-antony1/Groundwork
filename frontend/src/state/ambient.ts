import { useSyncExternalStore } from 'react'

// Ambient motion: the idle effects (radar sweep, beacon radio waves, marching STOP stripes, header
// scanline, tray ripple). On by default; hotkey A turns it off for the demo table, and the choice is
// remembered per browser. CSS keys off html[data-ambient]; reduced motion also stops all of it.

const KEY = 'gw.ambient'
const listeners = new Set<() => void>()

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

let on = stored()

function apply(): void {
  document.documentElement.dataset.ambient = on ? 'on' : 'off'
}
apply()

export function setAmbient(next: boolean): void {
  on = next
  try {
    localStorage.setItem(KEY, next ? 'on' : 'off')
  } catch {
    // Storage blocked (private window): the choice lasts for this visit.
  }
  apply()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAmbient(): boolean {
  return useSyncExternalStore(subscribe, () => on, () => on)
}
