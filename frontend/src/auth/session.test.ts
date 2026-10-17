import { describe, expect, it } from 'vitest'
import { NEEDS, allowed, roleLabel } from './session'
import type { Action } from './session'
import { rolesFromToken } from './token'

const ACTIONS = Object.keys(NEEDS) as Action[]

describe('who may do what (mirrors backend require_role)', () => {
  it('lets everyone do everything while backend auth is off, as the backend does', () => {
    for (const action of ACTIONS) expect(allowed(action, false, [])).toBe(true)
  })

  it('gives supervisors every write and crew only reports, once auth is on', () => {
    for (const action of ACTIONS) expect(allowed(action, true, ['supervisor'])).toBe(true)
    expect(allowed('sendReport', true, ['crew'])).toBe(true)
    for (const action of ACTIONS.filter((a) => a !== 'sendReport')) expect(allowed(action, true, ['crew'])).toBe(false)
  })

  it('allows nothing to a logged-out viewer once auth is on', () => {
    for (const action of ACTIONS) expect(allowed(action, true, [])).toBe(false)
  })

  it('names the strongest role', () => {
    expect(roleLabel(['crew', 'supervisor'])).toBe('Supervisor')
    expect(roleLabel(['crew'])).toBe('Crew')
    expect(roleLabel([])).toBe('No role')
  })
})

describe('rolesFromToken', () => {
  const token = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`
  const CLAIM = 'https://groundwork-api/roles'

  it('reads the roles claim the Post-Login Action adds', () => {
    expect(rolesFromToken(token({ [CLAIM]: ['crew'] }), CLAIM)).toEqual(['crew'])
  })

  it('returns no roles for a token without the claim, or garbage', () => {
    expect(rolesFromToken(token({ sub: 'x' }), CLAIM)).toEqual([])
    expect(rolesFromToken('not-a-jwt', CLAIM)).toEqual([])
  })
})
