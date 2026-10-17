import { QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiError, ContextMismatchError } from './errors'
import { qk } from './queryKeys'

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ContextMismatchError) return false // the context is changing; re-asking won't help
  if (error instanceof ApiError && !error.retryable) return false // 4xx: the request itself is wrong
  return failureCount < 2
}

function retryDelay(attempt: number, error: unknown): number {
  if (error instanceof ApiError && error.retryAfterSec) return error.retryAfterSec * 1000 // honor 429 Retry-After
  return Math.min(500 * 2 ** attempt, 4000)
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // A payload from the other context means our idea of live vs replay is out of date: re-ask the server.
      if (error instanceof ContextMismatchError) void queryClient.invalidateQueries({ queryKey: qk.replay })
    },
  }),
  defaultOptions: {
    queries: { retry: shouldRetry, retryDelay, staleTime: 0, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
})
