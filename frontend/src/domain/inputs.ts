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
