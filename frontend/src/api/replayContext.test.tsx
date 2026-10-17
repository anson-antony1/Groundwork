// Integration tests against the in-browser mock backend: the replay state lives on the server (as when
// Aashita starts it from her laptop), and the UI must follow it without ever mixing contexts.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StopWorkLayer } from '../components/StopWorkLayer'
import { resetDb } from '../mocks/db'
import { handle } from '../mocks/handlers'
import { recordDeviceEvent } from '../mocks/sensorSim'
import { useSites } from './queries'
import { queryClient } from './queryClient'
import { useServerCtx } from './serverCtx'
import { ServerCtxProvider } from './ServerCtxProvider'

interface Frame {
  ctx: string | null
  mode: string | undefined
}

function Probe({ frames }: { frames: Frame[] }) {
  const { ctx } = useServerCtx()
  const sites = useSites()
  frames.push({ ctx, mode: sites.data?.mode })
  return null
}

const serverStartsReplay = () => handle({ method: 'POST', path: '/api/v1/replay/start', json: { scenario_id: 'demo-storm' } })
const serverStopsReplay = () => handle({ method: 'POST', path: '/api/v1/replay/stop' })

afterEach(() => queryClient.clear())

describe('live/replay separation (README P13)', () => {
  it('never renders replay data in the live context, or live data during a replay', async () => {
    resetDb()
    const frames: Frame[] = []
    render(
      <QueryClientProvider client={queryClient}>
        <ServerCtxProvider>
          <Probe frames={frames} />
        </ServerCtxProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(frames.at(-1)?.mode).toBe('cached'), { timeout: 4000 })

    await serverStartsReplay()
    await waitFor(() => expect(frames.at(-1)?.mode).toBe('replay'), { timeout: 6000 })

    await serverStopsReplay()
    await waitFor(() => expect(frames.at(-1)?.mode).toBe('cached'), { timeout: 6000 })

    const shown = frames.filter((f) => f.ctx !== null && f.mode !== undefined)
    expect(shown.length).toBeGreaterThan(3)
    for (const frame of shown) expect(frame.mode === 'replay').toBe(frame.ctx !== 'live')
  }, 20_000)
})

describe('STOP WORK layer (README P4, P15)', () => {
  it('takes over on STOP WORK and keeps it after the crew acknowledges', async () => {
    resetDb()
    await serverStartsReplay()
    render(
      <QueryClientProvider client={queryClient}>
        <ServerCtxProvider>
          <StopWorkLayer />
        </ServerCtxProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/stop work/i), { timeout: 5000 })
    // The beacon display is polled once STOP WORK is active, so its alarm line follows a moment later.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/beacon alarm sounding/i), { timeout: 5000 })

    recordDeviceEvent('ack_touch')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/acknowledged .* status remains stop work/i), { timeout: 5000 })
    expect(screen.getAllByText(/stop work · all vehicles/i).length).toBeGreaterThan(0)
  }, 15_000)
})
