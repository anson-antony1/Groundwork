import { useEffect, useRef } from 'react'

/** Pointer handlers that call `onLongPress` after the pointer is held down for `ms` (works for touch too). */
export function useLongPress(onLongPress: () => void, ms = 2000) {
  const timer = useRef<number | undefined>(undefined)
  const cancel = () => window.clearTimeout(timer.current)
  useEffect(() => cancel, [])
  return {
    onPointerDown: () => {
      cancel()
      timer.current = window.setTimeout(onLongPress, ms)
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  }
}
