import { useEffect, useEffectEvent } from 'react'

/** True when the key press belongs to a text field, so global shortcuts should stay out of the way. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Global single-key shortcuts (no Ctrl/Cmd). `bindings` maps KeyboardEvent.key to a handler.
 * Ignored while typing in a field.
 */
export function useHotkeys(bindings: Record<string, () => void>): void {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.repeat || isTypingTarget(e.target)) return
    const handler = bindings[e.key]
    if (handler) {
      e.preventDefault()
      handler()
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
