import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { ANONYMOUS, SessionContext } from '../../auth/session'
import type { Session } from '../../auth/session'
import { isViewer } from '../../auth/viewer'
import { LoginScreen } from './LoginScreen'

function renderAt(path: string, session: Session) {
  const memory = memoryLocation({ path, record: true })
  render(
    <SessionContext.Provider value={session}>
      <Router hook={memory.hook} searchHook={memory.searchHook}>
        <LoginScreen />
      </Router>
    </SessionContext.Provider>,
  )
  return memory
}

const configured: Session = { ...ANONYMOUS, configured: true, ready: true }

describe('login page', () => {
  beforeEach(() => sessionStorage.clear())

  it('logs in or signs up through Auth0 and comes back to the page the visitor wanted', () => {
    const login = vi.fn()
    const signup = vi.fn()
    renderAt('/login?next=%2Fbriefing', { ...configured, login, signup })
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }))
    fireEvent.click(screen.getByRole('button', { name: /create an account/i }))
    expect(login).toHaveBeenCalledWith('/briefing')
    expect(signup).toHaveBeenCalledWith('/briefing')
  })

  it('explains the three kinds of sign-in', () => {
    renderAt('/login', configured)
    for (const role of ['Viewer', 'Crew', 'Supervisor']) expect(screen.getByText(role)).toBeInTheDocument()
  })

  it('lets a visitor continue as a viewer, remembered for this session', () => {
    const memory = renderAt('/login?next=%2Fdemo-tray', configured)
    fireEvent.click(screen.getByRole('button', { name: /continue as viewer/i }))
    expect(isViewer()).toBe(true)
    expect(memory.history?.at(-1)).toBe('/demo-tray')
  })

  it('says so when this copy has no login, and offers no sign-in buttons', () => {
    renderAt('/login', ANONYMOUS)
    expect(screen.getByText(/login isn’t set up/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^log in$/i })).not.toBeInTheDocument()
  })

  it('sends a logged-in user straight on', () => {
    const memory = renderAt('/login?next=%2Freplay', { ...configured, loggedIn: true, name: 'Sam', roles: ['supervisor'] })
    expect(memory.history?.at(-1)).toBe('/replay')
  })
})
