import type { ServerCtx } from './context'

type Ctx = ServerCtx | null

/**
 * Query keys. Status-bearing data (sites, site detail, evaluations, beacon display, timeline) is
 * scoped to the live/replay context as the LAST key element, so switching contexts drops it cleanly.
 * Sensor readings and crew reports are real in both contexts and aren't scoped.
 */
export const qk = {
  replay: ['replay'] as const,
  health: ['health'] as const,
  policies: ['policies'] as const,
  replayScenarios: ['replay-scenarios'] as const,
  briefings: ['briefings'] as const,
  sites: (ctx: Ctx) => ['sites', ctx] as const,
  site: (siteId: string, ctx: Ctx) => ['site', siteId, ctx] as const,
  evaluate: (siteId: string, input: string, ctx: Ctx) => ['evaluate', siteId, input, ctx] as const,
  display: (deviceId: string, ctx: Ctx) => ['display', deviceId, ctx] as const,
  events: (siteId: string | undefined, ctx: Ctx) => ['events', siteId ?? 'all', ctx] as const,
  latestReading: (deviceId: string) => ['latest-reading', deviceId] as const,
  readingHistory: (deviceId: string) => ['reading-history', deviceId] as const,
  deviceEvents: (deviceId: string) => ['device-events', deviceId] as const,
  reports: (siteId?: string) => ['reports', siteId ?? 'all'] as const,
}
