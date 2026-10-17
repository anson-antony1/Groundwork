import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '../../App'
import { queryClient } from '../../api/queryClient'

afterEach(() => {
  cleanup() // unmount before leaving /welcome, or the ops map would mount for a moment
  window.history.pushState({}, '', '/')
  queryClient.clear()
})

describe('/welcome', () => {
  it('renders the public front door outside the ops shell', async () => {
    window.history.pushState({}, '', '/welcome')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Which sites can crews reach tomorrow?' })).toBeInTheDocument()
    // No ops chrome: the screen nav and the STOP WORK layer belong to the console, not the landing page.
    expect(screen.queryByRole('navigation', { name: 'Screens' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /illustration: a storm crosses central florida/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /open ops console/i })[0]).toHaveAttribute('href', '/')
  })
})
