import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrayCrossSection } from './TrayCrossSection'

const HEAVY = { go_below: 40, mats_below: 65 }

describe('TrayCrossSection', () => {
  it('draws the live reading against the heavy-truck lines', () => {
    render(<TrayCrossSection moisture={58.4} heavy={HEAVY} />)
    expect(screen.getByRole('img', { name: 'Demo tray: moisture index 58.4 of 100' })).toBeInTheDocument()
    expect(screen.getByText('MATS 40')).toBeInTheDocument()
    expect(screen.getByText('NO-GO 65')).toBeInTheDocument()
  })

  it('never shows an old water level without a live reading', () => {
    render(<TrayCrossSection moisture={null} heavy={HEAVY} />)
    expect(screen.getByRole('img', { name: 'Demo tray: no live reading' })).toBeInTheDocument()
    expect(screen.getByText('NO LIVE READING')).toBeInTheDocument()
  })
})
