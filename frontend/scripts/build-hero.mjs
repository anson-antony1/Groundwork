// Builds src/assets/hero/florida-hero.json for the /welcome hero from the app's own basemap
// (src/assets/basemap/florida.json) and the backend's real site list (fixtures/sites_50.json, read-only).
// Coordinates are pre-projected (equirectangular at 29°N, 1° of latitude = 100 units) and simplified,
// so the hero draws plain SVG paths: no map library, no tiles, no API call, and it works offline.
//
// Run: npm run gen:hero   (re-run if either input changes)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))
const basemap = read('../src/assets/basemap/florida.json')
const { sites } = read('../../fixtures/sites_50.json')

const K = 100 * Math.cos((29 * Math.PI) / 180)
const proj = ([lon, lat]) => [(lon + 87.7) * K, (31.1 - lat) * 100]
const round = (v) => Math.round(v * 10) / 10

/** Douglas-Peucker. A closed ring starts and ends on one point, so it falls back to distance from it. */
function simplify(points, tol) {
  if (points.length < 3) return points
  const [x1, y1] = points[0]
  const [x2, y2] = points[points.length - 1]
  const dx = x2 - x1
  const dy = y2 - y1
  const norm = Math.hypot(dx, dy)
  let best = -1
  let idx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    const d = norm > 1e-6 ? Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm : Math.hypot(px - x1, py - y1)
    if (d > best) {
      best = d
      idx = i
    }
  }
  if (best <= tol) return [points[0], points[points.length - 1]]
  return [...simplify(points.slice(0, idx + 1), tol).slice(0, -1), ...simplify(points.slice(idx), tol)]
}

function ringPath(ring, tol) {
  const pts = simplify(ring.map(proj), tol)
  return pts.length < 3 ? '' : `M${pts.map(([x, y]) => `${round(x)},${round(y)}`).join('L')}Z`
}

const paths = { florida: '', neighbor: '', county: '' }
for (const f of basemap.features) {
  const kind = f.properties.kind
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]
  for (const poly of polys) for (const ring of poly) paths[kind] += ringPath(ring, kind === 'florida' ? 0.35 : 0.6)
}

const CITIES = [
  ['Jacksonville', 30.33, -81.66],
  ['Gainesville', 29.65, -82.32],
  ['Orlando', 28.54, -81.38],
  ['Daytona Beach', 29.21, -81.02],
]

const out = {
  generated_from: ['src/assets/basemap/florida.json', 'fixtures/sites_50.json'],
  paths,
  sites: sites.map((s) => proj([s.longitude, s.latitude]).map(round)),
  cities: CITIES.map(([name, lat, lon]) => [name, ...proj([lon, lat]).map(round)]),
}

const target = fileURLToPath(new URL('../src/assets/hero/florida-hero.json', import.meta.url))
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, JSON.stringify(out) + '\n')
console.log(`wrote ${out.sites.length} sites and ${(JSON.stringify(out).length / 1024).toFixed(1)} KB of hero geometry`)
