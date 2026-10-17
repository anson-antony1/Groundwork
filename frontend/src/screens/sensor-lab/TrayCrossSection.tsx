import { Droplets } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Card } from '../../components/Card'
import { LABELS } from '../../domain/provenance'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface Thresholds {
  go_below: number
  mats_below: number
}

// Drawing coordinates: the soil fills x 60-310, y 80-240, so moisture 0-100 maps onto 160 units.
const SOIL_LEFT = 60
const SOIL_TOP = 80
const SOIL_WIDTH = 250
const SOIL_BOTTOM = 240
const SOIL_HEIGHT = SOIL_BOTTOM - SOIL_TOP
const levelY = (moisture: number) => SOIL_BOTTOM - (Math.min(100, Math.max(0, moisture)) / 100) * SOIL_HEIGHT

/** A gentle wave, wider than the tray, that the ambient CSS slides sideways (theme.css .gw-ripple). */
const WAVE = `M30 0q5-2.4 10 0${'t10 0'.repeat(33)}V200H30Z`
/** A rise this big between readings reads as a pour. */
const POUR_STEP = 1
const SPOUT = { x: 124, y: 14 }

/**
 * The demo tray in cross-section: the water line follows the latest moisture reading against the
 * heavy-truck policy lines the beacon evaluates. A rise reads as a pour and drops fall from the can.
 * With no live reading the tray is drawn empty and says so: an old level never passes for a current one.
 */
export function TrayCrossSection({ moisture, heavy }: { moisture: number | null; heavy: Thresholds | undefined }) {
  const reduced = useReducedMotion()
  const drops = useRef<SVGGElement>(null)
  const previous = useRef<number | null>(null)
  const live = moisture !== null
  const y = live ? levelY(moisture) : SOIL_BOTTOM

  useEffect(() => {
    const before = previous.current
    previous.current = moisture
    const host = drops.current
    if (reduced || moisture === null || before === null || moisture - before < POUR_STEP || !host) return
    for (let i = 0; i < 8; i++) {
      const drop = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      drop.setAttribute('d', 'M0-4C2-1 3 1 3 2.5A3 3 0 0 1-3 2.5C-3 1-2-1 0-4Z')
      drop.setAttribute('fill', '#8fb9e0')
      drop.setAttribute('opacity', '0')
      host.appendChild(drop)
      const x = SPOUT.x + (Math.random() - 0.5) * 6
      const fall = drop.animate(
        [
          { transform: `translate(${x}px, ${SPOUT.y}px)`, opacity: 0 },
          { opacity: 1, offset: 0.12 },
          { transform: `translate(${x}px, ${levelY(moisture)}px)`, opacity: 0.9 },
        ],
        { duration: 520 + Math.random() * 120, delay: i * 70, easing: 'cubic-bezier(.5,0,1,1)' },
      )
      fall.onfinish = () => drop.remove()
    }
  }, [moisture, reduced])

  const line = (value: number, color: string, label: string) => (
    <g>
      <line x1={SOIL_LEFT} x2={322} y1={levelY(value)} y2={levelY(value)} stroke={color} strokeWidth={1.4} strokeDasharray="5 4" />
      <text x={326} y={levelY(value) + 3.5} fill={color} fontSize={12} className="font-display font-semibold tracking-[0.1em]">
        {label}
      </text>
    </g>
  )

  return (
    <Card
      title="Demo tray · cross-section"
      icon={<Droplets aria-hidden className="size-4" />}
      footer={`${LABELS.demoSensor} · water line drawn to the 0–100 moisture index, against the heavy-truck lines`}
    >
      <svg viewBox="0 0 410 252" className="mx-auto block w-full max-w-[440px]" role="img" aria-label={live ? `Demo tray: moisture index ${moisture.toFixed(1)} of 100` : 'Demo tray: no live reading'}>
        <defs>
          <clipPath id="tray-soil">
            <rect x={SOIL_LEFT} y={SOIL_TOP} width={SOIL_WIDTH} height={SOIL_HEIGHT} />
          </clipPath>
          <pattern id="tray-grain" width="9" height="9" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="3" r=".9" fill="#000000" fillOpacity=".28" />
            <circle cx="6.5" cy="7" r=".7" fill="#ffffff" fillOpacity=".07" />
          </pattern>
          <linearGradient id="tray-water" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#78aedd" stopOpacity=".78" />
            <stop offset=".12" stopColor="#4f86b8" stopOpacity=".58" />
            <stop offset="1" stopColor="#2f5d86" stopOpacity=".5" />
          </linearGradient>
        </defs>
        {/* The can the crew pours from. */}
        <g transform="translate(88 2)" fill="none" stroke="var(--color-muted)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
          <path d="M0 9h22v19H0z" />
          <path d="M22 13l14-8" />
          <path d="M4 9c0-7 14-7 14 0" />
        </g>
        <rect x={52} y={64} width={266} height={184} rx={6} fill="#0d1114" stroke="var(--color-line-hi)" strokeWidth={2} />
        <g clipPath="url(#tray-soil)">
          <rect x={SOIL_LEFT} y={SOIL_TOP} width={SOIL_WIDTH} height={44} fill="#5c4636" />
          <rect x={SOIL_LEFT} y={124} width={SOIL_WIDTH} height={56} fill="#47372b" />
          <rect x={SOIL_LEFT} y={180} width={SOIL_WIDTH} height={60} fill="#362b23" />
          <rect x={SOIL_LEFT} y={SOIL_TOP} width={SOIL_WIDTH} height={SOIL_HEIGHT} fill="url(#tray-grain)" />
          <g style={{ transform: `translateY(${y}px)`, transition: 'transform 1.2s cubic-bezier(.2,.8,.2,1)' }}>
            {live && <path className="gw-ripple" d={WAVE} fill="url(#tray-water)" />}
          </g>
        </g>
        <rect x={SOIL_LEFT} y={SOIL_TOP} width={SOIL_WIDTH} height={SOIL_HEIGHT} fill="none" stroke="var(--color-line)" />
        <text x={326} y={74} fill="var(--color-muted)" fontSize={12} className="font-display font-semibold tracking-[0.1em]">
          HEAVY TRUCK
        </text>
        {heavy && line(heavy.mats_below, 'var(--color-nogo-text)', `NO-GO ${heavy.mats_below}`)}
        {heavy && line(heavy.go_below, 'var(--color-caution)', `MATS ${heavy.go_below}`)}
        {heavy && (
          <text x={326} y={levelY(heavy.go_below / 2) + 3.5} fill="var(--color-go)" fontSize={12} className="font-display font-semibold tracking-[0.1em]">
            GO
          </text>
        )}
        {live && (
          <g style={{ transform: `translateY(${y}px)`, transition: 'transform 1.2s cubic-bezier(.2,.8,.2,1)' }}>
            <path d="M322 0l-9-5.5v11z" fill="var(--color-ink)" />
          </g>
        )}
        <g ref={drops} />
        {!live && (
          <text x={SOIL_LEFT + SOIL_WIDTH / 2} y={SOIL_TOP + SOIL_HEIGHT / 2} textAnchor="middle" fill="var(--color-unknown)" fontSize={16} className="font-display font-semibold tracking-[0.08em]">
            NO LIVE READING
          </text>
        )}
      </svg>
    </Card>
  )
}
