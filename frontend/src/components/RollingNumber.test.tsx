import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RollingNumber } from './RollingNumber'

describe('RollingNumber', () => {
  it('mounts already showing its value, as accessible text', () => {
    render(<RollingNumber value={7.5} decimals={1} />)
    expect(screen.getByText('7.5', { selector: '.sr-only' })).toBeInTheDocument()
  })

  it('keeps the real value readable when it changes', () => {
    // The digit strips hold every digit for the roll, so read the accessible text, not the strips.
    const { rerender } = render(<RollingNumber value={3} minDigits={2} />)
    expect(screen.getByText('3', { selector: '.sr-only' })).toBeInTheDocument()
    rerender(<RollingNumber value={61} minDigits={2} />)
    expect(screen.getByText('61', { selector: '.sr-only' })).toBeInTheDocument()
    expect(screen.queryByText('3', { selector: '.sr-only' })).not.toBeInTheDocument()
  })
})
