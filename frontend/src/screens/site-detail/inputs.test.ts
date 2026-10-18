import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FORM, toEvaluationInput } from './inputs'

describe('mat and cost form → EvaluationIn', () => {
  it('starts from the policy mat defaults, so the site page and the 6 PM brief give the same mat count', () => {
    const policy = JSON.parse(readFileSync(resolve(process.cwd(), '../policies/mats_defaults.json'), 'utf8'))  // tests run from frontend/
    expect(DEFAULT_FORM.unit).toBe(policy.unit)
    expect(Number(DEFAULT_FORM.mats.route_width)).toBe(policy.route_width)
    expect(Number(DEFAULT_FORM.mats.mat_length)).toBe(policy.mat_length)
    expect(Number(DEFAULT_FORM.mats.mat_width)).toBe(policy.mat_width)
    expect(Number(DEFAULT_FORM.mats.margin_min) / 100).toBeCloseTo(policy.margin_min)
    expect(Number(DEFAULT_FORM.mats.margin_max) / 100).toBeCloseTo(policy.margin_max)
  })

  it('turns the defaults into an evaluate request', () => {
    const result = toEvaluationInput(DEFAULT_FORM, 'heavy_truck')
    expect('input' in result && result.input).toMatchObject({
      vehicle: 'heavy_truck',
      unit: 'ft',
      route_length: 100,
      route_width: 12,
      mat_length: 14,
      mat_width: 8,
      layers: 1,
      margin_min: 0.1,
      margin_max: 0.25,
      mats_in_inventory: 40,
      costs: { mats_rental: 600, paid_idle_labor: 1800 },
    })
  })

  it('sends only the fields the strict backend schema accepts', () => {
    const result = toEvaluationInput(DEFAULT_FORM, 'pickup')
    expect('input' in result && Object.keys(result.input).sort()).toEqual(
      ['costs', 'layers', 'margin_max', 'margin_min', 'mat_length', 'mat_width', 'mats_in_inventory', 'route_length', 'route_width', 'unit', 'vehicle'].sort(),
    )
  })

  it('blocks out-of-range input instead of sending a request that would 422', () => {
    const bad = { ...DEFAULT_FORM, mats: { ...DEFAULT_FORM.mats, route_length: '0', margin_min: '30', margin_max: '20', mats_in_inventory: '2.5' } }
    const result = toEvaluationInput(bad, 'pickup')
    expect('errors' in result && result.errors).toEqual({ route_length: 'Must be more than 0', margin_max: 'Must be at least the low margin', mats_in_inventory: 'Whole number' })
  })

  it('never turns a blank field into zero', () => {
    const blank = { ...DEFAULT_FORM, costs: { ...DEFAULT_FORM.costs, delivery: '' } }
    const result = toEvaluationInput(blank, 'pickup')
    expect('errors' in result && result.errors.delivery).toBe('Required')
  })
})
