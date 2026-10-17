import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountButton } from './AccountButton'
import { ANONYMOUS, SessionContext } from './session'
import type { Session } from './session'

const renderWith = (session: Session) =>
  render(
    <SessionContext.Provider value={session}>
      <AccountButton />
    </SessionContext.Provider>,
  )

describe('AccountButton', () => {
  it('stays out of the way in builds without Auth0 (mock mode, demo site)', () => {
    const { container } = renderWith(ANONYMOUS)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers a login', () => {
    const login = vi.fn()
    renderWith({ ...ANONYMOUS, configured: true, login })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    expect(login).toHaveBeenCalledOnce()
  })

  it('shows who is logged in, with their role, and a logout', () => {
    const logout = vi.fn()
    renderWith({ ...ANONYMOUS, configured: true, loggedIn: true, name: 'sam@groundwork.test', roles: ['crew'], logout })
    expect(screen.getByText('sam@groundwork.test')).toBeInTheDocument()
    expect(screen.getByText(/crew/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))
    expect(logout).toHaveBeenCalledOnce()
  })
})
