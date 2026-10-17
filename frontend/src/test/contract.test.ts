// The mock backend must speak exactly the backend's contract: every mock response is validated against
// the schemas in backend/openapi.json (the file Aashita's own contract test keeps in sync with the code).
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ApiRequest } from '../api/transport'
import { resetDb } from '../mocks/db'
import { handle } from '../mocks/handlers'
import { tickSensor } from '../mocks/sensorSim'

const ID = 'https://groundwork.local/openapi.json'
const spec = JSON.parse(readFileSync(resolve(process.cwd(), '../backend/openapi.json'), 'utf8'))
const ajv = new Ajv2020({ strict: false, allErrors: true })
addFormats(ajv)
ajv.addSchema({ $id: ID, components: spec.components })

type Method = 'get' | 'post'

function validatorFor(method: Method, template: string, status: number) {
  const response = spec.paths[template]?.[method]?.responses?.[String(status)]
  const ref: string | undefined = response?.content?.['application/json']?.schema?.$ref
  if (!ref) throw new Error(`no ${status} schema for ${method.toUpperCase()} ${template}`)
  const validate = ajv.getSchema(`${ID}${ref}`)
  if (!validate) throw new Error(`cannot compile ${ref}`)
  return validate
}

async function expectContract(method: Method, template: string, req: Omit<ApiRequest, 'method'>, status: number) {
  const res = await handle({ ...req, method: method.toUpperCase() as ApiRequest['method'] })
  expect(res.status, JSON.stringify(res.body)).toBe(status)
  const validate = validatorFor(method, template, status)
  expect(validate(res.body), ajv.errorsText(validate.errors)).toBe(true)
  return res.body as { data: Record<string, unknown> & { id?: string } }
}

const AUTH = { Authorization: 'Bearer dev-sensor-token' }
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const EVALUATION = { vehicle: 'heavy_truck', route_length: 100, route_width: 12, mat_length: 8, mat_width: 4 }

function reportForm(photo?: Blob) {
  const form = new FormData()
  form.set('site_id', 'DEMO-TRAY')
  form.set('description', 'Standing water near the southern gate')
  form.set('category_user', 'standing_water')
  if (photo) form.set('photo', photo, 'photo.png')
  return form
}

beforeEach(() => {
  resetDb()
  tickSensor()
})

describe('mock responses match backend/openapi.json', () => {
  it('health, sites and site detail', async () => {
    await expectContract('get', '/api/v1/health', { path: '/api/v1/health' }, 200)
    const sites = await expectContract('get', '/api/v1/sites', { path: '/api/v1/sites', query: { limit: 500 } }, 200)
    expect((sites.data as unknown as unknown[]).length).toBeGreaterThanOrEqual(51)
    await expectContract('get', '/api/v1/sites/{site_id}', { path: '/api/v1/sites/SITE-001' }, 200)
    await expectContract('get', '/api/v1/sites/{site_id}', { path: '/api/v1/sites/DEMO-TRAY' }, 200)
  })

  it('evaluate', async () => {
    await expectContract('post', '/api/v1/sites/{site_id}/evaluate', { path: '/api/v1/sites/DEMO-TRAY/evaluate', json: EVALUATION }, 200)
  })

  it('sensors, display and device events', async () => {
    await expectContract('get', '/api/v1/sensors/{device_id}/latest', { path: '/api/v1/sensors/tray-01/latest' }, 200)
    await expectContract('get', '/api/v1/sensors/{device_id}/history', { path: '/api/v1/sensors/tray-01/history' }, 200)
    await expectContract('get', '/api/v1/devices/{device_id}/display', { path: '/api/v1/devices/tray-01/display' }, 200)
    await expectContract(
      'post',
      '/api/v1/devices/{device_id}/events',
      { path: '/api/v1/devices/tray-01/events', headers: AUTH, json: { event: 'crew_flag', recorded_at: new Date().toISOString() } },
      201,
    )
    await expectContract('get', '/api/v1/devices/{device_id}/events', { path: '/api/v1/devices/tray-01/events' }, 200)
  })

  it('reports and the timeline', async () => {
    const created = await expectContract('post', '/api/v1/reports', { path: '/api/v1/reports', form: reportForm(new Blob([PNG], { type: 'image/png' })) }, 201)
    await expectContract('get', '/api/v1/reports/{report_id}', { path: `/api/v1/reports/${created.data.id}` }, 200)
    await expectContract('get', '/api/v1/reports', { path: '/api/v1/reports' }, 200)
    await expectContract('get', '/api/v1/events', { path: '/api/v1/events', query: { site_id: 'DEMO-TRAY' } }, 200)
  })

  it('replay and briefings, including during a replay', async () => {
    await expectContract('get', '/api/v1/replay', { path: '/api/v1/replay' }, 200)
    await expectContract('post', '/api/v1/replay/start', { path: '/api/v1/replay/start', json: { scenario_id: 'demo-storm' } }, 200)
    const sites = await expectContract('get', '/api/v1/sites', { path: '/api/v1/sites', query: { limit: 500 } }, 200)
    for (const site of sites.data as unknown as { effective_status: Record<string, string> }[]) {
      expect(site.effective_status).toEqual({ pickup: 'STOP_WORK', heavy_truck: 'STOP_WORK' })
    }
    const brief = await expectContract('post', '/api/v1/briefings/generate', { path: '/api/v1/briefings/generate' }, 201)
    await expectContract('get', '/api/v1/briefings/{briefing_id}', { path: `/api/v1/briefings/${brief.data.id}` }, 200)
    await expectContract('get', '/api/v1/briefings', { path: '/api/v1/briefings' }, 200)
    await expectContract('post', '/api/v1/replay/stop', { path: '/api/v1/replay/stop' }, 200)
    await expectContract('get', '/api/v1/policies', { path: '/api/v1/policies' }, 200)
  })

  it('uses the shared error shape', async () => {
    await expectContract('get', '/api/v1/sites/{site_id}', { path: '/api/v1/sites/NOPE' }, 404)
    await expectContract('post', '/api/v1/sites/{site_id}/evaluate', { path: '/api/v1/sites/DEMO-TRAY/evaluate', json: { ...EVALUATION, surprise: 1 } }, 422)
    await expectContract('post', '/api/v1/reports', { path: '/api/v1/reports', form: reportForm(new Blob(['GIF89a'], { type: 'image/gif' })) }, 415)
  })
})

describe('mock covers the whole contract', () => {
  const sample: Record<string, string> = { site_id: 'DEMO-TRAY', device_id: 'tray-01', report_id: 'x', briefing_id: 'x' }

  it.each(Object.entries(spec.paths).flatMap(([path, ops]) => Object.keys(ops as object).map((m) => [m.toUpperCase(), path])))(
    '%s %s is implemented',
    async (method, template) => {
      const path = (template as string).replace(/\{(\w+)\}/g, (_, name: string) => sample[name])
      const res = await handle({ method: method as ApiRequest['method'], path, headers: AUTH, json: {} })
      const message = (res.body as { error?: { message?: string } }).error?.message
      expect(message).not.toBe('Not Found')
      expect(res.status).not.toBe(405)
    },
  )
})

describe('mock mirrors backend behavior from backend/tests/test_api.py', () => {
  it('moisture drives access per vehicle; the beacon evaluates the heavy truck', async () => {
    resetDb()
    await handle({ method: 'POST', path: '/api/v1/sensors/readings', headers: AUTH, json: { device_id: 'tray-01', site_id: 'DEMO-TRAY', moisture_index: 50, recorded_at: new Date().toISOString(), mode: 'sensor_demo' } })
    const display = (await handle({ method: 'GET', path: '/api/v1/devices/tray-01/display' })).body as { code: string }
    expect(display.code).toBe('MATS')
    const site = (await handle({ method: 'GET', path: '/api/v1/sites/DEMO-TRAY' })).body as { data: { access_call: unknown } }
    expect(site.data.access_call).toEqual({ pickup: 'GO_FOR_REVIEW', heavy_truck: 'MATS_FOR_REVIEW' })
  })

  it('touch acknowledges STOP WORK without clearing it', async () => {
    await handle({ method: 'POST', path: '/api/v1/replay/start' })
    await handle({ method: 'POST', path: '/api/v1/devices/tray-01/events', headers: AUTH, json: { event: 'ack_touch', recorded_at: new Date().toISOString() } })
    const d = (await handle({ method: 'GET', path: '/api/v1/devices/tray-01/display' })).body as { effective_status: string; alarm: boolean; acknowledged_at: string | null }
    expect(d.effective_status).toBe('STOP_WORK')
    expect(d.alarm).toBe(false)
    expect(d.acknowledged_at).not.toBeNull()
  })

  it('never recommends mats during STOP WORK', async () => {
    await handle({ method: 'POST', path: '/api/v1/replay/start' })
    const res = await handle({ method: 'POST', path: '/api/v1/sites/DEMO-TRAY/evaluate', json: EVALUATION })
    const data = (res.body as { data: { mats_recommended: boolean; notes: string[] } }).data
    expect(data.mats_recommended).toBe(false)
    expect(data.notes.length).toBeGreaterThan(0)
  })

  it('computes the README mat example (38 base, 42–48, shortfall 8)', async () => {
    const res = await handle({ method: 'POST', path: '/api/v1/sites/DEMO-TRAY/evaluate', json: { ...EVALUATION, margin_min: 0.1, margin_max: 0.25, mats_in_inventory: 40, costs: { mats_rental: 900, paid_idle_labor: 2800 } } })
    const data = (res.body as { data: { mats_estimate: Record<string, number>; cost_comparison: { modeled_difference: number } } }).data
    expect([data.mats_estimate.base_mats, data.mats_estimate.min_estimate, data.mats_estimate.max_estimate, data.mats_estimate.shortfall]).toEqual([38, 42, 48, 8])
    expect(data.cost_comparison.modeled_difference).toBe(1900)
  })
})
