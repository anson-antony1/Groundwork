// Mock-mode transport: the in-browser backend with realistic latency and injectable faults.
import { ApiError } from '../api/errors'
import type { Transport } from '../api/transport'
import { db, newId } from './db'
import { handle } from './handlers'
import { startSensorSim } from './sensorSim'

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

const errorBody = (code: string, message: string) => ({ error: { code, message, details: [], request_id: newId('mock') } })

export const mockTransport: Transport = async (req) => {
  startSensorSim()
  await sleep(80 + Math.random() * 170 + (db.fault === 'slow' ? 3000 : 0), req.signal)
  switch (db.fault) {
    case 'offline':
      throw new ApiError({ status: 0, code: 'NETWORK', message: 'Network error: the API is unreachable (mock fault)' })
    case 'error500':
      return { status: 500, body: errorBody('INTERNAL_ERROR', 'An unexpected error occurred. (mock fault)'), headers: {} }
    case 'rate429':
      return { status: 429, body: errorBody('RATE_LIMITED', 'Rate limit of 600 requests per minute exceeded. (mock fault)'), headers: { 'retry-after': '5' } }
    default:
      return handle(req)
  }
}
