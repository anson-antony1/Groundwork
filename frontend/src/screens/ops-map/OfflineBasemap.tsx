import type { FeatureCollection } from 'geojson'
import { divIcon } from 'leaflet'
import type { PathOptions } from 'leaflet'
import { useEffect, useState } from 'react'
import { GeoJSON, Marker } from 'react-leaflet'
import { reloadingImport } from '../../components/staleBuild'

const STYLE: Record<string, PathOptions> = {
  florida: { color: '#6b7682', weight: 2, fillColor: '#1e242b', fillOpacity: 1 },
  neighbor: { color: '#3d4650', weight: 1.5, fillColor: '#13161a', fillOpacity: 1 },
  county: { color: '#363e47', weight: 0.8, fill: false },
}

/** Orientation labels for the vector basemap (approximate city centers). */
const CITIES: [string, number, number][] = [
  ['Pensacola', 30.42, -87.22],
  ['Tallahassee', 30.44, -84.28],
  ['Jacksonville', 30.33, -81.66],
  ['Gainesville', 29.65, -82.32],
  ['Orlando', 28.54, -81.38],
  ['Tampa', 27.95, -82.46],
  ['Miami', 25.76, -80.19],
]

const cityIcon = (name: string) =>
  divIcon({
    html: `<span style="font: 600 12px Barlow, sans-serif; color: #9aa6b2; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; text-shadow: 0 1px 2px #000">${name}</span>`,
    className: 'gw-marker',
    iconSize: [0, 0],
    iconAnchor: [-6, 6],
  })

/** Florida county outlines bundled with the app, for when OpenStreetMap tiles can't load. */
export function OfflineBasemap() {
  const [data, setData] = useState<FeatureCollection | null>(null)
  useEffect(() => {
    let alive = true
    void reloadingImport(() => import('../../assets/basemap/florida.json'))().then((m) => {
      if (alive) setData(m.default as unknown as FeatureCollection)
    })
    return () => {
      alive = false
    }
  }, [])
  if (!data) return null
  return (
    <>
      <GeoJSON data={data} interactive={false} style={(f) => STYLE[(f?.properties as { kind?: string } | undefined)?.kind ?? 'county']} />
      {CITIES.map(([name, lat, lon]) => (
        <Marker key={name} position={[lat, lon]} icon={cityIcon(name)} interactive={false} keyboard={false} />
      ))}
    </>
  )
}
