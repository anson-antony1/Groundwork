// Query hooks: one per screen need, with the polling interval from the plan's budget table.
// Only mounted screens poll, and TanStack Query pauses polling in hidden tabs.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { NewReport } from './client'
import { DEMO_DEVICE_ID, hasEndpoint } from './config'
import { assertModeMatches, belongsToCtx } from './context'
import type { ServerCtx } from './context'
import { ApiError } from './errors'
import { PROPOSED_ENDPOINTS } from './proposed'
import type { ReportReviewInput } from './proposed'
import { qk } from './queryKeys'
import { useServerCtx } from './serverCtx'
import type { DataMode, Envelope, EvaluationInput, PageEnvelope, Reading } from './types'

function guarded<T extends { mode: DataMode }>(value: T, ctx: ServerCtx | null): T {
  if (ctx) assertModeMatches(value.mode, ctx)
  return value
}

export function useSites() {
  const { ctx } = useServerCtx()
  return useQuery({
    queryKey: qk.sites(ctx),
    queryFn: async ({ signal }) => guarded(await api.sites(signal), ctx),
    enabled: ctx !== null,
    refetchInterval: 5_000,
  })
}

export function useSite(siteId: string) {
  const { ctx } = useServerCtx()
  return useQuery({
    queryKey: qk.site(siteId, ctx),
    queryFn: async ({ signal }) => guarded(await api.site(siteId, signal), ctx),
    enabled: ctx !== null && siteId !== '',
    refetchInterval: 2_000,
  })
}

/**
 * POST /sites/{id}/evaluate is stateless, so it's a query keyed by its inputs (debounce them first).
 * `statusKey` re-runs it when the site's status changes (e.g. moisture rises or a replay starts).
 */
export function useEvaluate(siteId: string, input: EvaluationInput | null, statusKey: string) {
  const { ctx } = useServerCtx()
  const inputKey = input ? `${JSON.stringify(input)}|${statusKey}` : ''
  return useQuery({
    queryKey: qk.evaluate(siteId, inputKey, ctx),
    queryFn: async ({ signal }) => guarded(await api.evaluate(siteId, input!, signal), ctx),
    enabled: ctx !== null && input !== null,
    // Keep showing the previous numbers while new inputs load, but never across a live/replay switch.
    placeholderData: (previous, previousQuery) =>
      ctx && previousQuery && belongsToCtx(previousQuery.queryKey, ctx) ? previous : undefined,
  })
}

export function useDisplay(deviceId = DEMO_DEVICE_ID, intervalMs = 1_000, enabled = true) {
  const { ctx } = useServerCtx()
  return useQuery({
    queryKey: qk.display(deviceId, ctx),
    queryFn: async ({ signal }) => guarded(await api.display(deviceId, signal), ctx),
    enabled: enabled && ctx !== null,
    refetchInterval: intervalMs,
  })
}

/** Readings kept for the live chart: about 10 minutes at 1 Hz. */
const SERIES_LIMIT = 600

/** Adds a reading to the cached history (newest first) unless it's already there. */
function appendReading(history: PageEnvelope<Reading> | undefined, reading: Reading): PageEnvelope<Reading> | undefined {
  if (!history) return history
  const newest = history.data[0]
  if (newest && newest.received_at === reading.received_at && newest.seq === reading.seq) return history
  return { ...history, data: [reading, ...history.data].slice(0, SERIES_LIMIT) }
}

/**
 * Latest beacon reading, or null when the device hasn't sent one yet (the API answers 404).
 * Each new reading is also appended to the cached history, so the live chart grows without refetching it.
 */
export function useLatestReading(deviceId = DEMO_DEVICE_ID, enabled = true) {
  const queryClient = useQueryClient()
  return useQuery({
    enabled,
    queryKey: qk.latestReading(deviceId),
    queryFn: async ({ signal }) => {
      try {
        const env = await api.latestReading(deviceId, signal)
        queryClient.setQueryData<PageEnvelope<Reading>>(qk.readingHistory(deviceId), (h) => appendReading(h, env.data))
        return env
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    refetchInterval: 1_000,
  })
}

export function useReadingHistory(deviceId = DEMO_DEVICE_ID, limit = 300) {
  return useQuery({
    queryKey: qk.readingHistory(deviceId),
    queryFn: ({ signal }) => api.readingHistory(deviceId, limit, signal),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

export function useDeviceEvents(deviceId = DEMO_DEVICE_ID) {
  return useQuery({
    queryKey: qk.deviceEvents(deviceId),
    queryFn: ({ signal }) => api.deviceEvents(deviceId, 50, signal),
    refetchInterval: 2_000,
  })
}

export function useReports(siteId?: string) {
  return useQuery({
    queryKey: qk.reports(siteId),
    queryFn: ({ signal }) => api.reports(siteId, signal),
    refetchInterval: 2_000,
  })
}

export function useEvents(siteId?: string) {
  const { ctx } = useServerCtx()
  return useQuery({
    queryKey: qk.events(siteId, ctx),
    queryFn: async ({ signal }) => guarded(await api.events(siteId, signal), ctx),
    enabled: ctx !== null,
    refetchInterval: 5_000,
  })
}

export function useHealth() {
  return useQuery({ queryKey: qk.health, queryFn: ({ signal }) => api.health(signal), refetchInterval: 15_000 })
}

export function usePolicies() {
  return useQuery({ queryKey: qk.policies, queryFn: ({ signal }) => api.policies(signal), staleTime: Infinity })
}

export function useLatestBriefing() {
  return useQuery({ queryKey: qk.briefings, queryFn: ({ signal }) => api.briefings(1, signal) })
}

export function useReplayScenarios() {
  return useQuery({
    queryKey: qk.replayScenarios,
    queryFn: ({ signal }) => api.replayScenarios(signal),
    enabled: hasEndpoint(PROPOSED_ENDPOINTS.replayScenarios),
    staleTime: Infinity,
  })
}

// --- Mutations -------------------------------------------------------------

/**
 * Start/stop write the server's answer straight into the replay query, so this screen switches instantly.
 * An in-flight /replay poll is cancelled first: its older answer must not land afterwards and flip us back.
 */
export function useReplayControl() {
  const queryClient = useQueryClient()
  const onMutate = () => queryClient.cancelQueries({ queryKey: qk.replay })
  const onSuccess = (env: Envelope<unknown>) => queryClient.setQueryData(qk.replay, env)
  const start = useMutation({ mutationFn: (scenarioId?: string) => api.startReplay(scenarioId), onMutate, onSuccess })
  const stop = useMutation({ mutationFn: () => api.stopReplay(), onMutate, onSuccess })
  return { start, stop }
}

export function useCreateReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewReport) => api.createReport(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
      void queryClient.invalidateQueries({ queryKey: ['site'] })
      void queryClient.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useReviewReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, input }: { reportId: string; input: ReportReviewInput }) => api.reviewReport(reportId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
      void queryClient.invalidateQueries({ queryKey: ['site'] })
    },
  })
}

export function useGenerateBriefing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.generateBriefing(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.briefings }),
  })
}

export function useClearCrewFlag(deviceId = DEMO_DEVICE_ID) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.clearCrewFlag(deviceId),
    onSuccess: () => {
      for (const key of ['display', 'site', 'sites', 'device-events']) void queryClient.invalidateQueries({ queryKey: [key] })
    },
  })
}

export function useResetDemo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => api.resetDemo(token),
    // Everything may have changed (replay ended, reports cleared): refetch from scratch.
    onSuccess: () => queryClient.resetQueries(),
  })
}
