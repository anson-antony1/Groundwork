import { statusVisual } from '../domain/status'
import type { MarkerOptions } from './markerSvg'
import { markerSvg } from './markerSvg'

/** React wrapper for legends and lists. */
export function StatusMarker({ status, ...opts }: MarkerOptions & { status: string | null | undefined }) {
  const v = statusVisual(status)
  return <span className="inline-flex shrink-0" dangerouslySetInnerHTML={{ __html: markerSvg(v.shape, v.tone, opts) }} />
}
