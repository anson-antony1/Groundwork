// Builds the offline basemap (src/assets/basemap/florida.json) from us-atlas (US Census cartographic
// boundaries, public domain): Florida's 67 counties plus outlines of Florida and its neighbors.
// Used when OpenStreetMap tiles can't load (venue Wi-Fi down, README P14 / §14.7). We never bulk-cache
// OSM tiles: their usage policy forbids it.
//
// Run: npm run gen:basemap
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { feature } from 'topojson-client'

const require = createRequire(import.meta.url)
const topo = require('us-atlas/counties-10m.json')

const FLORIDA = '12'
const NEIGHBORS = new Set(['01', '13']) // Alabama, Georgia

/** ~100 m precision is plenty for an outline and keeps the file small. */
const round = (coords) => (typeof coords[0] === 'number' ? coords.map((c) => Math.round(c * 1000) / 1000) : coords.map(round))

const slim = (f, kind) => ({
  type: 'Feature',
  properties: { kind, name: f.properties.name },
  geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
})

const counties = feature(topo, topo.objects.counties).features.filter((f) => f.id.startsWith(FLORIDA)).map((f) => slim(f, 'county'))
const states = feature(topo, topo.objects.states).features
  .filter((f) => f.id === FLORIDA || NEIGHBORS.has(f.id))
  .map((f) => slim(f, f.id === FLORIDA ? 'florida' : 'neighbor'))

const out = fileURLToPath(new URL('../src/assets/basemap/', import.meta.url))
mkdirSync(out, { recursive: true })
const json = JSON.stringify({ type: 'FeatureCollection', features: [...states, ...counties] })
writeFileSync(`${out}florida.json`, `${json}\n`)
console.log(`wrote ${counties.length} counties + ${states.length} state outlines (${Math.round(json.length / 1024)} KB)`)
