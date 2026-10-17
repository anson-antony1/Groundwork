import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { SiteDetailView } from '../../api/proposed'
import { POLICY } from '../../mocks/rules'
import { DemoUiProvider } from '../../state/DemoUiProvider'
import { useDemoUi } from '../../state/demoUiContext'
import { AccessCard } from './AccessCard'
import { HazardCard } from './HazardCard'

const NOW = Date.parse('2026-10-17T21:00:00Z')

const site: SiteDetailView = {
  id: 'SITE-042',
  name: 'Test site',
  latitude: 28.5,
  longitude: -81.4,
  region: 'Orange',
  location_origin: 'test fixture',
  hazard_score: 3.4,
  weather_state: 'NORMAL',
  access_call: { pickup: 'GO_FOR_REVIEW', heavy_truck: 'MATS_FOR_REVIEW' },
  effective_status: { pickup: 'GO_FOR_REVIEW', heavy_truck: 'MATS_FOR_REVIEW' },
  data_status: 'available',
  observations: [
    { variable: 'rain_7d', value: 43.5, unit: 'mm', source: 'Open-Meteo', kind: 'modeled', valid_at: '2026-10-15', fetched_at: '2026-10-17T03:52:55Z', quality: 'available', reference_url: null },
  ],
  missing_fields: ['nws_alerts', 'usda_soil'],
  evaluated_at: '2026-10-17T21:00:00Z',
  reports: [],
  hazard_subscores: { rain: 4, wind: 2, heat: 5, flood: 1, storm: 1 },
}

function Harness() {
  const { vehicle } = useDemoUi()
  return (
    <>
      <HazardCard site={site} stale={false} />
      <AccessCard site={site} vehicle={vehicle} policy={POLICY} reading={null} now={NOW} stale={false} />
    </>
  )
}

const section = (title: string) => screen.getByText(title).closest('section')!

describe('vehicle toggle (README P7)', () => {
  it('changes the access call but never the weather hazard card', async () => {
    localStorage.setItem('groundwork.vehicle', 'pickup')
    render(
      <DemoUiProvider>
        <Harness />
      </DemoUiProvider>,
    )
    const hazardBefore = section('Weather hazard · all vehicles').textContent
    expect(section('Ground access · per vehicle').textContent).toContain('GO · FOR REVIEW')

    await userEvent.click(screen.getByRole('radio', { name: /heavy truck/i }))

    expect(screen.getByRole('radio', { name: /heavy truck/i })).toHaveAttribute('aria-checked', 'true')
    expect(section('Ground access · per vehicle').textContent).toContain('MATS · FOR REVIEW')
    expect(section('Weather hazard · all vehicles').textContent).toBe(hazardBefore)
  })
})
