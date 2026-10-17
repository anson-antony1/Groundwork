import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RollingNumber } from '../../components/RollingNumber'
import { TONE_VAR } from '../../components/tone'
import { cx } from '../../components/cx'
import { useInView } from '../../hooks/useInView'
import { useRafLoop } from '../../hooks/useRafLoop'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { CITIES, LOOP_S, PATHS, SITES, STILL_T, VIEW_BOX, bandAt, bandTransform, countsAt, phaseAt, statusAt } from './stormLoop'
import type { HeroStatus } from './stormLoop'

// The app's marker silhouettes (screens/ops-map/markerSvg.ts), centred on 0,0 so a frame can swap them.
const SHAPE: Record<HeroStatus, string> = {
  GO: 'M-11.5 0a11.5 11.5 0 1 0 23 0a11.5 11.5 0 1 0-23 0Z',
  MATS: 'M0-12.5L13.5 11.5H-13.5Z',
  STOP: 'M-5.4-13.5H5.4L13.5-5.4V5.4L5.4 13.5H-5.4L-13.5 5.4V-5.4Z',
}
const FILL: Record<HeroStatus, string> = { GO: TONE_VAR.go, MATS: TONE_VAR.caution, STOP: TONE_VAR.stop }
const LABEL: Record<HeroStatus, string> = { GO: 'GO', MATS: 'Mats', STOP: 'Stop work' }
const MARK_SCALE = 0.19
const ABOUT_CENTER: CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center' }

// The reduced-motion still frame is plain render output; only the running loop mutates the SVG.
const STILL_STATUS = SITES.map((site) => statusAt(site, STILL_T))
const STILL_COUNTS = countsAt(STILL_T)
const STILL_BAND = bandTransform(bandAt(STILL_T) ?? 0)

function Counter({ status, value }: { status: HeroStatus; value: number }) {
  return (
    <div className="flex min-w-[4.4rem] flex-col gap-1 rounded-[3px] border border-line bg-panel/90 px-2 py-1.5 sm:min-w-[5.2rem] sm:px-3 sm:py-2">
      <span className="flex items-center gap-1.5 text-[0.68rem] text-muted label-caps">
        <svg viewBox="-16 -16 32 32" aria-hidden className="size-3">
          <path d={SHAPE[status]} fill={FILL[status]} />
        </svg>
        {LABEL[status]}
      </span>
      <RollingNumber value={value} minDigits={2} durationMs={380} className="font-display text-[1.4rem] leading-none font-bold sm:text-[1.9rem]" />
    </div>
  )
}

/**
 * Illustrative 12 s loop for /welcome: a rain band crosses central Florida and the 60 real
 * substations stamp to STOP as it passes, then clear to GO, or to MATS where the ground stays wet.
 * Frames are drawn by mutating the SVG directly, so React only re-renders when a counter changes.
 * Pauses offscreen and in hidden tabs; with reduced motion it shows one still frame.
 */
export function StormHero({ className }: { className?: string }) {
  const reduced = useReducedMotion()
  const root = useRef<HTMLDivElement>(null)
  const inView = useInView(root)
  const band = useRef<SVGGElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const marks = useRef<(SVGGElement | null)[]>([])
  const shown = useRef<HeroStatus[]>([])
  const [counts, setCounts] = useState(() => countsAt(0))
  const [phase, setPhase] = useState(() => phaseAt(0))

  const draw = useCallback((t: number, stamp: boolean) => {
    const at = bandAt(t)
    if (band.current) {
      band.current.setAttribute('visibility', at === null ? 'hidden' : 'visible')
      if (at !== null) band.current.setAttribute('transform', bandTransform(at))
    }
    SITES.forEach((site, i) => {
      const status = statusAt(site, t)
      const mark = marks.current[i]
      if (!mark || shown.current[i] === status) return
      shown.current[i] = status
      const shape = mark.lastElementChild
      shape?.setAttribute('d', SHAPE[status])
      shape?.setAttribute('fill', FILL[status])
      if (stamp && status === 'STOP' && typeof mark.animate === 'function') {
        mark.animate(
          [{ transform: 'scale(1.9)', opacity: 0 }, { transform: 'scale(.92)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' },
        )
        mark.firstElementChild?.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 650, easing: 'ease-out' })
      }
    })
    const next = countsAt(t)
    setCounts((prev) => (prev.GO === next.GO && prev.MATS === next.MATS && prev.STOP === next.STOP ? prev : next))
    setPhase(phaseAt(t))
    if (bar.current) bar.current.style.transform = `scaleX(${(t / LOOP_S).toFixed(4)})`
  }, [])

  // Whatever React rendered last (base frame or still frame) is what the loop starts from.
  useEffect(() => {
    shown.current = reduced ? [...STILL_STATUS] : SITES.map((s) => s.base)
  }, [reduced])
  useRafLoop((elapsed) => draw(elapsed % LOOP_S, true), !reduced && inView)
  const start = (i: number) => (reduced ? STILL_STATUS[i] : SITES[i].base)

  return (
    <div ref={root} className={cx('relative overflow-hidden bg-[#0e1216]', className)}>
      <svg
        viewBox={VIEW_BOX.join(' ')}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        role="img"
        aria-label="Illustration: a storm crosses central Florida and the 60 real substation locations change status as it passes"
      >
        <defs>
          <linearGradient id="hero-band" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7d9fc2" stopOpacity="0" />
            <stop offset=".35" stopColor="#7d9fc2" stopOpacity=".24" />
            <stop offset=".6" stopColor="#94b4d4" stopOpacity=".34" />
            <stop offset=".8" stopColor="#7d9fc2" stopOpacity=".2" />
            <stop offset="1" stopColor="#7d9fc2" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hero-band-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".45" stopColor="#fff" stopOpacity="1" />
            <stop offset=".75" stopColor="#fff" stopOpacity=".8" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="hero-band-mask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1">
            <rect width="1" height="1" fill="url(#hero-band-fade)" />
          </mask>
          <pattern id="hero-rain" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
            <line x1="1" y1="0" x2="1" y2="3.4" stroke="#b9cfe4" strokeWidth=".5" strokeOpacity=".45" />
          </pattern>
        </defs>
        <path d={PATHS.neighbor} fill="#13161a" stroke="#3d4650" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={PATHS.florida} fill="#1e242b" stroke="#6b7682" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <path d={PATHS.county} fill="none" stroke="#363e47" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        {CITIES.map(([name, x, y]) => (
          <g key={name}>
            <circle cx={x} cy={y} r={1.1} fill="#808c98" />
            <text x={x + 2.8} y={y + 2} fontSize={5.6} fill="#9aa6b2" className="font-sans font-semibold tracking-[0.06em]">
              {name.toUpperCase()}
            </text>
          </g>
        ))}
        <g ref={band} visibility={reduced ? 'visible' : 'hidden'} transform={reduced ? STILL_BAND : undefined}>
          <rect x={-75} y={-410} width={150} height={820} fill="url(#hero-band)" />
          <rect x={-75} y={-410} width={150} height={820} fill="url(#hero-rain)" mask="url(#hero-band-mask)" />
        </g>
        {SITES.map((site, i) => (
          <g key={`${site.x},${site.y}`} transform={`translate(${site.x} ${site.y}) scale(${MARK_SCALE})`}>
            <g
              ref={(el) => {
                marks.current[i] = el
              }}
              style={ABOUT_CENTER}
            >
              <circle r={13} fill="none" stroke={TONE_VAR.stop} strokeWidth={2.5} opacity={0} style={ABOUT_CENTER} />
              <path d={SHAPE[start(i)]} fill={FILL[start(i)]} stroke="#0b0c0d" strokeWidth={2.2} />
            </g>
          </g>
        ))}
      </svg>
      <p className="absolute right-3 bottom-4 hidden max-w-[calc(100%-1.5rem)] rounded-[2px] border border-line bg-panel/90 px-2.5 py-1.5 text-[0.72rem] leading-tight label-caps sm:block">
        {reduced ? 'Storm crossing · still frame' : phase}
      </p>
      {/* Down the empty west edge on wide screens; a row across the top on phones. */}
      <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 sm:top-3 sm:left-3 sm:flex-col sm:gap-2">
        {(['GO', 'MATS', 'STOP'] as const).map((status) => (
          <Counter key={status} status={status} value={(reduced ? STILL_COUNTS : counts)[status]} />
        ))}
      </div>
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-line">
        <span ref={bar} className="block h-full origin-left bg-muted" style={{ transform: `scaleX(${reduced ? STILL_T / LOOP_S : 0})` }} />
      </span>
    </div>
  )
}
