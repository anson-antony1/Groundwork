import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Calls `onFrame(elapsedSeconds)` on every animation frame while `active`. The clock only advances
 * while frames run, so a paused loop (offscreen, hidden tab, `active` false) resumes where it stopped.
 */
export function useRafLoop(onFrame: (elapsed: number) => void, active: boolean): void {
  const callback = useRef(onFrame)
  const elapsed = useRef(0)
  useLayoutEffect(() => {
    callback.current = onFrame
  })
  useEffect(() => {
    if (!active) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      // Browsers stop frames in hidden tabs; cap the gap so returning doesn't jump the loop.
      elapsed.current += Math.min(now - last, 100) / 1000
      last = now
      callback.current(elapsed.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
}
