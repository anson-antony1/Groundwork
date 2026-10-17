import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Throws({ error }: { error: Error }): never {
  throw error
}

beforeEach(() => {
  // React logs every error a boundary catches; keep the test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // As if this tab just reloaded, so the stale-build path shows its message instead of navigating jsdom.
  sessionStorage.setItem('gw.staleBuildReloadAt', String(Date.now()))
})

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('ErrorBoundary', () => {
  it('renders the screen when nothing goes wrong', () => {
    render(<ErrorBoundary>ranked list</ErrorBoundary>)
    expect(screen.getByText('ranked list')).toBeInTheDocument()
  })

  it('shows the error with a retry instead of a blank app', () => {
    render(
      <ErrorBoundary>
        <Throws error={new Error('Cannot read properties of undefined')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("This screen couldn't load")
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot read properties of undefined')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('explains a screen file that a newer deploy replaced', () => {
    render(
      <ErrorBoundary>
        <Throws error={new TypeError('Failed to fetch dynamically imported module: /assets/BriefingScreen-BnOvbvih.js')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('updated while this tab was open')
  })

  it('recovers when the user navigates to another screen', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/briefing">
        <Throws error={new Error('boom')} />
      </ErrorBoundary>,
    )
    rerender(<ErrorBoundary resetKey="/">map</ErrorBoundary>)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('map')).toBeInTheDocument()
  })
})
