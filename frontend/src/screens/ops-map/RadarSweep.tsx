import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMap } from 'react-leaflet'
import type { SiteView } from '../../api/proposed'
import { useRafLoop } from '../../hooks/useRafLoop'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useAmbient } from '../../state/ambient'

const PERIOD_S = 6

/** Clockwise angle from north, 0-360, of point (x, y) around (cx, cy) in screen coordinates. */
function bearing(x: number, y: number, cx: number, cy: number): number {
  const deg = (Math.atan2(x - cx, cy - y) * 180) / Math.PI
  return deg < 0 ? deg + 360 : deg
}

/**
 * Ambient radar sweep over the ops map: a faint arm turns every 6 s and each site pings as it
 * passes. It is decoration, not data: pings are neutral, never status colors. It sits above the
 * map panes but is click-through, and it runs only with ambient motion on and reduced motion off.
 */
export function RadarSweep({ sites }: { sites: SiteView[] }) {
  const map = useMap()
  const ambient = useAmbient()
  const reduced = useReducedMotion()
  const layer = useRef<HTMLDivElement>(null)
  const arm = useRef<HTMLDivElement>(null)
  const lastAngle = useRef<number | null>(null)
  const active = ambient && !reduced

  useRafLoop((elapsed) => {
    const angle = ((elapsed % PERIOD_S) / PERIOD_S) * 360
    if (arm.current) arm.current.style.transform = `translate(-50%, -50%) rotate(${angle.toFixed(2)}deg)`
    const last = lastAngle.current
    lastAngle.current = angle
    const host = layer.current
    if (last === null || !host) return
    const size = map.getSize()
    for (const site of sites) {
      const p = map.latLngToContainerPoint([site.latitude, site.longitude])
      if (p.x < 0 || p.y < 0 || p.x > size.x || p.y > size.y) continue
      const a = bearing(p.x, p.y, size.x / 2, size.y / 2)
      const crossed = last <= angle ? a > last && a <= angle : a > last || a <= angle
      if (!crossed) continue
      const ping = document.createElement('span')
      ping.className = 'gw-radar-ping'
      ping.style.left = `${p.x}px`
      ping.style.top = `${p.y}px`
      host.appendChild(ping)
      const animation = ping.animate(
        [
          { transform: 'scale(0.6)', opacity: 0.9 },
          { transform: 'scale(2.6)', opacity: 0 },
        ],
        { duration: 900, easing: 'ease-out' },
      )
      animation.onfinish = () => ping.remove()
    }
  }, active)

  if (!active) return null
  return createPortal(
    <div ref={layer} aria-hidden className="gw-radar">
      <div ref={arm} className="gw-radar-arm" style={{ transform: 'translate(-50%, -50%)' }} />
    </div>,
    map.getContainer(),
  )
}
