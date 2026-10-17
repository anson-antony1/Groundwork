import type { RefObject } from 'react'
import { useEffect, useState } from 'react'

/** Whether the element is on screen, so offscreen animation loops can pause. True without IntersectionObserver. */
export function useInView(ref: RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.02 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return inView
}
