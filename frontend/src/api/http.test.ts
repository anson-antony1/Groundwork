import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAccessTokenProvider } from '../auth/token'
import { httpTransport } from './http'

function captureFetch() {
  const calls: { method: string; headers: Record<string, string> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, init: RequestInit) => {
      calls.push({ method: String(init.method), headers: init.headers as Record<string, string> })
      return new Response('{}', { status: 200 })
    }),
  )
  return calls
}

afterEach(() => {
  setAccessTokenProvider(null)
  vi.unstubAllGlobals()
})

describe('httpTransport and the Auth0 token', () => {
  it('sends the logged-in user token with writes', async () => {
    const calls = captureFetch()
    setAccessTokenProvider(async () => 'user-token')
    await httpTransport({ method: 'POST', path: '/api/v1/briefings/generate' })
    expect(calls[0].headers.Authorization).toBe('Bearer user-token')
  })

  it('never makes reads wait on Auth0', async () => {
    const calls = captureFetch()
    const provider = vi.fn(async () => 'user-token')
    setAccessTokenProvider(provider)
    await httpTransport({ method: 'GET', path: '/api/v1/sites' })
    expect(calls[0].headers.Authorization).toBeUndefined()
    expect(provider).not.toHaveBeenCalled()
  })

  it("keeps a caller's own credential, like the reset dialog's sensor token", async () => {
    const calls = captureFetch()
    setAccessTokenProvider(async () => 'user-token')
    await httpTransport({ method: 'POST', path: '/api/v1/demo/reset', headers: { Authorization: 'Bearer sensor' } })
    expect(calls[0].headers.Authorization).toBe('Bearer sensor')
  })

  it('still sends the write, without a token, if Auth0 fails', async () => {
    const calls = captureFetch()
    setAccessTokenProvider(async () => {
      throw new Error('login_required')
    })
    await httpTransport({ method: 'POST', path: '/api/v1/reports' })
    expect(calls).toHaveLength(1)
    expect(calls[0].headers.Authorization).toBeUndefined()
  })
})
