import type { MarkerShape, Tone } from '../domain/status'
import { TONE_VAR } from './tone'

export interface MarkerOptions {
  /** Pixel size of the square marker. */
  size?: number
  selected?: boolean
  /** Historical replay data: hatched fill. */
  hatched?: boolean
  /** Simulated data: dashed outline. */
  dashed?: boolean
}

const PATHS: Record<Exclude<MarkerShape, 'ring'>, string> = {
  circle: '<circle cx="16" cy="16" r="11.5"/>',
  triangle: '<path d="M16 3.5 L29.5 27.5 H2.5 Z"/>',
  square: '<rect x="4.5" y="4.5" width="23" height="23" rx="2"/>',
  diamond: '<path d="M16 1.8 L30.2 16 L16 30.2 L1.8 16 Z"/>',
  octagon: '<path d="M10.6 2.5 H21.4 L29.5 10.6 V21.4 L21.4 29.5 H10.6 L2.5 21.4 V10.6 Z"/>',
}

/**
 * Status marker as an SVG string, shared by React (StatusMarker) and Leaflet divIcons.
 * Built only from constants above, so it is safe to inject as markup.
 */
export function markerSvg(shape: MarkerShape, tone: Tone, opts: MarkerOptions = {}): string {
  const { size = 30, selected = false, hatched = false, dashed = false } = opts
  const ring = selected ? '<circle cx="16" cy="16" r="15.2" fill="none" stroke="#e8ecef" stroke-width="1.6"/>' : ''
  if (shape === 'ring') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${ring}<circle cx="16" cy="16" r="11" fill="#111315" stroke="${TONE_VAR.unknown}" stroke-width="2.6" stroke-dasharray="4.5 3"/><text x="16" y="21" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="700" font-size="15" fill="${TONE_VAR.unknown}">?</text></svg>`
  }
  const outline = `stroke="#0b0c0d" stroke-width="2.2"${dashed ? ' stroke-dasharray="3.5 2.5"' : ''}`
  const hatch = hatched
    ? `<defs><pattern id="gw-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="5" fill="rgb(0 0 0 / 0.38)"/></pattern></defs><g fill="url(#gw-hatch)">${PATHS[shape]}</g>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${ring}<g fill="${TONE_VAR[tone]}" ${outline}>${PATHS[shape]}</g>${hatch}</svg>`
}
