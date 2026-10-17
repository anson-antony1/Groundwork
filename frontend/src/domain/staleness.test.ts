import { describe, expect, it } from 'vitest'
import { STALE_BUDGET_MS, isStale } from './staleness'

describe('isStale', () => {
  const now = 1_000_000

  it('is fresh inside the budget', () => {
    expect(isStale({ updatedAt: now - 5_000, now, budgetMs: STALE_BUDGET_MS.beacon, failed: false })).toBe(false)
  })

  it('goes stale past the budget, matching the beacon’s 6 s NO LINK rule', () => {
    expect(isStale({ updatedAt: now - 6_001, now, budgetMs: STALE_BUDGET_MS.beacon, failed: false })).toBe(true)
  })

  it('goes stale as soon as a poll fails, even with recent data', () => {
    expect(isStale({ updatedAt: now - 100, now, budgetMs: STALE_BUDGET_MS.map, failed: true })).toBe(true)
  })

  it('treats never-loaded data as loading, not stale', () => {
    expect(isStale({ updatedAt: 0, now, budgetMs: STALE_BUDGET_MS.site, failed: true })).toBe(false)
  })
})
