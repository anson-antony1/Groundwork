import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FlapCount, SplitFlap } from './SplitFlap'

const faces = (container: HTMLElement, half: string) => [...container.querySelectorAll(`.gw-flap-${half}`)].map((el) => el.textContent)

describe('SplitFlap', () => {
  it('mounts showing its text on the cards, with the real value as accessible text', () => {
    const { container } = render(<SplitFlap text="7.5" />)
    expect(screen.getByText('7.5', { selector: '.sr-only' })).toBeInTheDocument()
    expect(faces(container, 'top')).toEqual(['7', '5'])
    expect(faces(container, 'bottom')).toEqual(['7', '5'])
  })

  it('shows a new value at once where animation is unavailable (jsdom, reduced motion)', () => {
    const { container, rerender } = render(<FlapCount value={3} />)
    expect(screen.getByText('3', { selector: '.sr-only' })).toBeInTheDocument()
    rerender(<FlapCount value={61} />)
    expect(screen.getByText('61', { selector: '.sr-only' })).toBeInTheDocument()
    expect(faces(container, 'bottom')).toEqual(['6', '1'])
  })
})
