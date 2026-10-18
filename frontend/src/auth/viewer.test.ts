import { describe, expect, it } from 'vitest'
import { needsLoginPage, nextPath } from './viewer'

const signedOut = { configured: true, ready: true, loggedIn: false }

describe('who sees the login page first', () => {
  it('sends signed-out visitors to it once Auth0 has checked for a login', () => {
    expect(needsLoginPage(signedOut, '/', false)).toBe(true)
    expect(needsLoginPage(signedOut, '/sites/SITE-001', false)).toBe(true)
  })

  it('leaves everyone else alone', () => {
    expect(needsLoginPage({ ...signedOut, configured: false }, '/', false)).toBe(false) // no Auth0 in this build
    expect(needsLoginPage({ ...signedOut, ready: false }, '/', false)).toBe(false) // still checking
    expect(needsLoginPage({ ...signedOut, loggedIn: true }, '/', false)).toBe(false)
    expect(needsLoginPage(signedOut, '/', true)).toBe(false) // chose "Continue as viewer"
  })

  it('never redirects the login page or the public front door', () => {
    expect(needsLoginPage(signedOut, '/login', false)).toBe(false)
    expect(needsLoginPage(signedOut, '/welcome', false)).toBe(false)
  })
})

describe('where the login page sends you back to', () => {
  it('keeps in-app paths', () => {
    expect(nextPath('?next=%2Fsites%2FSITE-001')).toBe('/sites/SITE-001')
    expect(nextPath('next=/briefing')).toBe('/briefing')
    expect(nextPath('')).toBe('/')
  })

  it('refuses anything that could leave the site or loop', () => {
    expect(nextPath('?next=https://evil.example')).toBe('/')
    expect(nextPath('?next=//evil.example')).toBe('/')
    expect(nextPath('?next=/login')).toBe('/')
  })
})
