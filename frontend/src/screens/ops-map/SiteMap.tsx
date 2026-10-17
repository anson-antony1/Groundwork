import { divIcon, latLngBounds } from 'leaflet'
import type { DivIcon } from 'leaflet'
import { memo, useEffect, useEffectEvent, useRef } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import { DEMO_SITE_ID } from '../../api/config'
import type { SiteView } from '../../api/proposed'
import type { DataMode } from '../../api/types'
import { beaconMarkerSvg, markerSvg, reportPinSvg } from '../../components/markerSvg'
import { StatusTag } from '../../components/StatusTag'
import { fmtNum } from '../../domain/format'
import { STATUS_ORDER, statusVisual } from '../../domain/status'
import type { StatusKey } from '../../domain/status'
import { OfflineBasemap } from './OfflineBasemap'
import { RadarSweep } from './RadarSweep'
import type { ReportSummary } from './SiteList'

const FLORIDA_CENTER: [number, number] = [28.2, -83.4]
const SIZE = 30
const BEACON_SIZE = 42

/** The demo-tray beacon, with three radio-wave rings that the ambient CSS animates (theme.css .gw-beacon). */
const beaconHtml = (svg: string) => `<span class="gw-beacon"><i></i><i></i><i></i>${svg}</span>`

const iconCache = new Map<string, DivIcon>()
function cachedIcon(key: string, build: () => DivIcon): DivIcon {
  let icon = iconCache.get(key)
  if (!icon) {
    icon = build()
    iconCache.set(key, icon)
  }
  return icon
}

/**
 * Keeps every field site in view: fits when sites first load and again whenever the container
 * resizes (layout settling, window or zoom changes), until someone pans or zooms the map themselves.
 */
function FitToSites({ sites }: { sites: SiteView[] }) {
  const map = useMap()
  const userMoved = useRef(false)
  const hasSites = sites.length > 0
  const fit = useEffectEvent(() => {
    map.invalidateSize()
    if (userMoved.current || sites.length === 0) return
    map.fitBounds(latLngBounds(sites.map((s) => [s.latitude, s.longitude])), { padding: [28, 28], animate: false })
  })

  useEffect(() => {
    const container = map.getContainer()
    const takeOver = () => {
      userMoved.current = true
    }
    container.addEventListener('pointerdown', takeOver)
    container.addEventListener('wheel', takeOver, { passive: true })
    const observer = new ResizeObserver(() => fit())
    observer.observe(container)
    fit()
    return () => {
      observer.disconnect()
      container.removeEventListener('pointerdown', takeOver)
      container.removeEventListener('wheel', takeOver)
    }
  }, [map, hasSites])
  return null
}

function FlyToSelected({ id, lat, lon }: { id: string | null; lat?: number; lon?: number }) {
  const map = useMap()
  useEffect(() => {
    if (!id || lat === undefined || lon === undefined) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.flyTo([lat, lon], Math.max(map.getZoom(), 8), { animate: !reduce, duration: 0.8 })
  }, [map, id, lat, lon])
  return null
}

export type Basemap = 'tiles' | 'offline'

interface SiteMapProps {
  basemap: Basemap
  /** Tiles keep failing (4 errors within 10 s): the screen switches to the offline basemap. */
  onTilesFailing: () => void
  sites: SiteView[]
  /** Envelope mode of the site list; per-site `mode` (proposed) wins when present. */
  listMode: DataMode | undefined
  statusOf: (site: SiteView) => StatusKey
  reports: Map<string, ReportSummary>
  /** Report ids already on screen at first load; anything newer drops in with an animation. */
  knownReportIds: ReadonlySet<string>
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

/** Memoized: the screen ticks every second for relative times, but the map only changes with its data. */
export const SiteMap = memo(function SiteMap(props: SiteMapProps) {
  const { sites, statusOf, selectedId, hoveredId } = props
  const fieldSites = sites.filter((s) => s.id !== DEMO_SITE_ID)
  const selected = sites.find((s) => s.id === selectedId)
  const tileErrors = useRef<number[]>([])

  return (
    <MapContainer center={FLORIDA_CENTER} zoom={7} zoomControl={false} className="h-full w-full" aria-label="Map of sites">
      {props.basemap === 'tiles' ? (
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          className="gw-tiles"
          maxZoom={18}
          eventHandlers={{
            tileerror: () => {
              const now = Date.now()
              tileErrors.current = [...tileErrors.current.filter((t) => now - t < 10_000), now]
              if (tileErrors.current.length >= 4) props.onTilesFailing()
            },
            tileload: () => {
              tileErrors.current = []
            },
          }}
        />
      ) : (
        <OfflineBasemap />
      )}
      <ZoomControl position="topright" />
      <FitToSites sites={fieldSites} />
      <FlyToSelected id={selected?.id ?? null} lat={selected?.latitude} lon={selected?.longitude} />
      <RadarSweep sites={sites} />

      {sites.map((site) => {
        const status = statusOf(site)
        const v = statusVisual(status)
        const isDemo = site.id === DEMO_SITE_ID
        const hot = site.id === selectedId || site.id === hoveredId
        const mode = site.mode ?? props.listMode
        const hatched = mode === 'replay'
        const dashed = mode === 'simulated'
        const size = isDemo ? BEACON_SIZE : SIZE
        const key = `${isDemo ? 'beacon' : v.shape}|${v.tone}|${site.id === selectedId}|${hot}|${hatched}|${dashed}`
        const icon = cachedIcon(key, () =>
          divIcon({
            html: isDemo ? beaconHtml(beaconMarkerSvg(v.tone, size, site.id === selectedId)) : markerSvg(v.shape, v.tone, { size, selected: site.id === selectedId, hatched, dashed }),
            className: hot ? 'gw-marker is-hot' : 'gw-marker',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        )
        // Severe statuses stack on top, so a red marker is never hidden under a green one.
        const severity = STATUS_ORDER.length - Math.max(0, STATUS_ORDER.indexOf(status))
        return (
          <Marker
            key={site.id}
            position={[site.latitude, site.longitude]}
            icon={icon}
            title={`${site.name}: ${v.label}`}
            alt={`${site.name}: ${v.label}`}
            zIndexOffset={site.id === selectedId ? 5000 : isDemo ? 3000 : severity * 100}
            eventHandlers={{
              click: () => props.onSelect(site.id),
              mouseover: () => props.onHover(site.id),
              mouseout: () => props.onHover(null),
            }}
          >
            <Tooltip className="gw-tooltip" direction="top" offset={[0, -size / 2]} opacity={1}>
              <span className="flex flex-col gap-1.5">
                <span className="font-semibold">{site.name}</span>
                <StatusTag status={status} size="sm" />
                <span className="text-muted">
                  Hazard {site.hazard_score === null || site.hazard_score === undefined ? 'missing' : `${fmtNum(site.hazard_score)} / 10`}
                </span>
              </span>
            </Tooltip>
          </Marker>
        )
      })}

      {sites.map((site) => {
        const summary = props.reports.get(site.id)
        if (!summary) return null
        const fresh = !props.knownReportIds.has(summary.latestId)
        // A new pin gets its own (uncached) icon so its drop-in animation plays once.
        const html = fresh ? `<div class="animate-drop-in">${reportPinSvg(summary.count)}</div>` : reportPinSvg(summary.count)
        const icon = fresh
          ? divIcon({ html, className: 'gw-marker', iconSize: [40, 32], iconAnchor: [-6, 40] })
          : cachedIcon(`report|${summary.count}`, () => divIcon({ html, className: 'gw-marker', iconSize: [40, 32], iconAnchor: [-6, 40] }))
        return (
          <Marker
            key={`report-${site.id}-${summary.latestId}`}
            position={[site.latitude, site.longitude]}
            icon={icon}
            zIndexOffset={6000}
            title={`${summary.count} crew report(s) at ${site.name}, unverified`}
            alt={`${summary.count} crew report(s) at ${site.name}, unverified`}
            eventHandlers={{ click: () => props.onSelect(site.id) }}
          >
            <Tooltip className="gw-tooltip" direction="top" offset={[20, -40]} opacity={1}>
              <span className="flex flex-col gap-1">
                <span className="font-semibold">
                  {summary.count} crew report{summary.count > 1 ? 's' : ''} · {site.name}
                </span>
                <span className="text-muted">Reported by crew · unverified until reviewed</span>
              </span>
            </Tooltip>
          </Marker>
        )
      })}
    </MapContainer>
  )
})
