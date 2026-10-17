// The /welcome hero's 12-second loop. Illustrative, not data: a rain band crosses central Florida and
// each of the 60 real substations shows what Groundwork would call as it passes. Every frame is a
// pure function of time, so the loop is seamless, testable, and can stop on any still frame.
import hero from '../../assets/hero/florida-hero.json'

export type HeroStatus = 'GO' | 'MATS' | 'STOP'

export interface HeroSite {
  x: number
  y: number
  /** Position along the storm's path. The band reaches sites in this order. */
  along: number
  /** Ground stays wet after the band passes: MATS until it dries. */
  wet: boolean
  /** Status before the storm (a few sites already need mats). */
  base: HeroStatus
  /** Seconds into the loop when wet ground has dried. */
  dryAt: number
}

export const LOOP_S = 12
/** The band enters at T_IN and has crossed every site by T_OUT; everything is calm again by CALM_AT. */
const T_IN = 0.9
const T_OUT = 7.3
export const CALM_AT = 11.2
/** A site is at STOP WORK from HALF ahead of the band's centre to HALF + LAG behind it. */
const HALF = 26
const LAG = 36
/** The storm travels east-north-east, roughly Hurricane Milton's track across the peninsula. */
const HEADING = (35 * Math.PI) / 180
const DX = Math.cos(HEADING)
const DY = -Math.sin(HEADING)
const ORIGIN = [537, 228] as const
/** How far before and after the middle site the band starts and ends. */
const REACH = 210

export const VIEW_BOX = [390, 66, 330, 226] as const
export const PATHS = hero.paths
export const CITIES = hero.cities as [string, number, number][]

/** Deterministic per-site traits, so the loop is identical on every load. */
function unit(i: number, salt: number): number {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(salt + 7, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export const SITES: HeroSite[] = (hero.sites as [number, number][])
  .map(([x, y], i) => ({
    x,
    y,
    along: (x - ORIGIN[0]) * DX + (y - ORIGIN[1]) * DY,
    wet: unit(i, 1) < 0.46,
    base: (unit(i, 2) < 0.1 ? 'MATS' : 'GO') as HeroStatus,
    dryAt: 8.3 + unit(i, 3) * 2.7,
  }))
  // Draw north to south, so southern markers overlap northern ones like on the ops map.
  .sort((a, b) => a.y - b.y)

// The band is slowest over the middle site, which is where most substations are (Orlando).
const alongs = SITES.map((s) => s.along).sort((a, b) => a - b)
const MIDDLE = alongs[Math.floor(alongs.length / 2)]
const S0 = MIDDLE - REACH
const S1 = MIDDLE + REACH

/** Fast in from the Gulf, slow over Orlando, fast out to the Atlantic. */
const pace = (p: number) => 0.5 * p + 0.5 * (0.5 + 4 * Math.pow(p - 0.5, 3))

/** Where the band's leading edge is along the storm path, or null when it is off the map. */
export function bandAt(t: number): number | null {
  if (t < T_IN || t > T_OUT) return null
  return S0 + (S1 - S0) * pace((t - T_IN) / (T_OUT - T_IN))
}

/** SVG transform that places the band for position `along`. */
export function bandTransform(along: number): string {
  const c = along - LAG / 2
  return `translate(${(ORIGIN[0] + DX * c).toFixed(1)} ${(ORIGIN[1] + DY * c).toFixed(1)}) rotate(${(-HEADING * 180) / Math.PI})`
}

export function statusAt(site: HeroSite, t: number): HeroStatus {
  const band = bandAt(t)
  const after = site.wet ? 'MATS' : site.base
  if (band !== null) {
    if (band + HALF >= site.along && band - HALF - LAG <= site.along) return 'STOP'
    return band - HALF - LAG > site.along ? after : site.base
  }
  return t > T_OUT && t < site.dryAt ? after : site.base
}

export function countsAt(t: number): Record<HeroStatus, number> {
  const counts: Record<HeroStatus, number> = { GO: 0, MATS: 0, STOP: 0 }
  for (const s of SITES) counts[statusAt(s, t)] += 1
  return counts
}

export function phaseAt(t: number): string {
  if (t < T_IN || t >= CALM_AT) return 'Calm · forecast clear'
  if (bandAt(t) !== null) return 'Storm crossing · stop work under the band'
  return 'Ground drying · mats where it stays wet'
}

/** The frame with the most sites at STOP WORK: the still image for reduced motion and the social card. */
export const STILL_T = (() => {
  let best = T_IN
  let most = -1
  for (let t = T_IN; t <= T_OUT; t += 0.05) {
    const stops = countsAt(t).STOP
    if (stops > most) {
      most = stops
      best = t
    }
  }
  return Math.round(best * 100) / 100
})()
