import type { Site } from '../api/types'

export interface InputsSummary {
  /** Inputs with a value. */
  have: number
  /** Inputs the backend expects: every observation plus every field it reports missing. */
  total: number
  missing: string[]
  stale: boolean
}

/** How complete a site's data is, from the backend's own observations and missing_fields. */
export function inputsSummary(site: Pick<Site, 'observations' | 'missing_fields' | 'data_status'>): InputsSummary {
  const present = site.observations.filter((o) => o.value !== null && o.quality !== 'missing')
  const variables = new Set([...site.observations.map((o) => o.variable), ...site.missing_fields])
  const missing = [...variables].filter((v) => !present.some((o) => o.variable === v))
  return {
    have: present.length,
    total: variables.size,
    missing,
    stale: site.data_status === 'stale' || site.observations.some((o) => o.quality === 'stale'),
  }
}

export interface SourceCoverage {
  label: string
  /** Sites with a usable value from this source. */
  have: number
  total: number
  /** Newest fetch time seen for this source, if any. */
  fetchedAt: string | null
}

const SOURCES: [label: string, variable: string][] = [
  ['Open-Meteo weather', 'rain_forecast'],
  ['USDA soil survey', 'usda_soil'],
  ['NWS alerts', 'nws_alerts'],
]

/**
 * Per-source coverage across sites, counted from the observations the API actually returned
 * (README §15 validation metrics). More trustworthy than a connector flag that can lag the data.
 */
export function sourceCoverage(sites: readonly Pick<Site, 'observations'>[]): SourceCoverage[] {
  return SOURCES.map(([label, variable]) => {
    let have = 0
    let fetchedAt: string | null = null
    for (const site of sites) {
      const o = site.observations.find((x) => x.variable === variable)
      if (o && o.value !== null && o.quality !== 'missing') have++
      if (o && (!fetchedAt || o.fetched_at > fetchedAt)) fetchedAt = o.fetched_at
    }
    return { label, have, total: sites.length, fetchedAt }
  })
}
