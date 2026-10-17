import { describe, expect, it } from 'vitest'
import { assertModeMatches, belongsToCtx, ctxOf, isReplayCtx } from './context'
import { ContextMismatchError } from './errors'

describe('server context', () => {
  it('is live when no replay is active', () => {
    expect(ctxOf({ active: false, scenario_id: null, started_at: null })).toBe('live')
  })

  it('gives each replay run its own context', () => {
    const a = ctxOf({ active: true, scenario_id: 'demo-storm', started_at: '2026-10-17T21:00:00Z' })
    const b = ctxOf({ active: true, scenario_id: 'demo-storm', started_at: '2026-10-17T21:05:00Z' })
    expect(isReplayCtx(a)).toBe(true)
    expect(a).not.toBe(b)
  })

  it('scopes query keys by their last element', () => {
    expect(belongsToCtx(['sites', 'live'], 'live')).toBe(true)
    expect(belongsToCtx(['sites', 'live'], 'replay:x:1')).toBe(false)
    expect(belongsToCtx(['reports', 'all'], 'live')).toBe(false)
  })
})

describe('mode guard never mixes live and replay data', () => {
  const replay = ctxOf({ active: true, scenario_id: 'demo-storm', started_at: '2026-10-17T21:00:00Z' })

  it.each(['live', 'cached', 'simulated', 'sensor_demo', 'sensor_replay'] as const)('accepts %s data in the live context', (mode) => {
    expect(() => assertModeMatches(mode, 'live')).not.toThrow()
  })

  it('rejects replay data in the live context', () => {
    expect(() => assertModeMatches('replay', 'live')).toThrow(ContextMismatchError)
  })

  it.each(['live', 'cached', 'sensor_demo'] as const)('rejects %s data during a replay', (mode) => {
    expect(() => assertModeMatches(mode, replay)).toThrow(ContextMismatchError)
  })

  it('accepts replay data during a replay', () => {
    expect(() => assertModeMatches('replay', replay)).not.toThrow()
  })
})
