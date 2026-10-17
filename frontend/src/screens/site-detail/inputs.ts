// Mat and cost inputs for POST /sites/{id}/evaluate. The UI only collects them; every count, range and
// dollar figure comes back from the backend. Bounds mirror EvaluationIn (strict: unknown keys are a 422).
import type { CostInputs, EvaluationInput, Vehicle } from '../../api/types'

export type MatField = 'route_length' | 'route_width' | 'mat_length' | 'mat_width' | 'margin_min' | 'margin_max' | 'mats_in_inventory'
export type CostField = keyof Required<CostInputs>

export interface PlanForm {
  unit: 'ft' | 'm'
  layers: number
  mats: Record<MatField, string>
  costs: Record<CostField, string>
}

/**
 * Starting values: the README's own worked examples (§6 and backend/tests/test_api.py), so the first
 * numbers on screen are ones the team has checked by hand. All labeled "Scenario assumption • adjustable".
 */
export const DEFAULT_FORM: PlanForm = {
  unit: 'ft',
  layers: 1,
  mats: { route_length: '100', route_width: '12', mat_length: '8', mat_width: '4', margin_min: '10', margin_max: '25', mats_in_inventory: '40' },
  costs: {
    mats_rental: '600',
    delivery: '150',
    installation: '100',
    removal: '50',
    delay_not_prevented: '0',
    paid_idle_labor: '1800',
    idle_equipment: '600',
    rescheduling: '400',
    extra_contract_cost: '0',
    idle_hours: '0',
    labor_rate_per_hour: '0',
    equipment_rate_per_hour: '0',
  },
}

const MAT_RULES: Record<MatField, { min: number; max: number; exclusiveMin?: boolean; integer?: boolean; percent?: boolean }> = {
  route_length: { min: 0, max: 100_000, exclusiveMin: true },
  route_width: { min: 0, max: 1_000, exclusiveMin: true },
  mat_length: { min: 0, max: 100, exclusiveMin: true },
  mat_width: { min: 0, max: 100, exclusiveMin: true },
  margin_min: { min: 0, max: 100, percent: true },
  margin_max: { min: 0, max: 100, percent: true },
  mats_in_inventory: { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true },
}

export type FormErrors = Partial<Record<MatField | CostField, string>>

function check(text: string, rule: { min: number; max: number; exclusiveMin?: boolean; integer?: boolean }): string | null {
  if (text.trim() === '') return 'Required'
  const n = Number(text)
  if (!Number.isFinite(n)) return 'Enter a number'
  if (rule.integer && !Number.isInteger(n)) return 'Whole number'
  if (rule.exclusiveMin ? n <= rule.min : n < rule.min) return rule.exclusiveMin ? 'Must be more than 0' : `At least ${rule.min}`
  if (n > rule.max) return `At most ${rule.max.toLocaleString()}`
  return null
}

/** Validates the form; returns the request body, or the errors to show (no request is sent then). */
export function toEvaluationInput(form: PlanForm, vehicle: Vehicle): { input: EvaluationInput } | { errors: FormErrors } {
  const errors: FormErrors = {}
  for (const [field, rule] of Object.entries(MAT_RULES) as [MatField, (typeof MAT_RULES)[MatField]][]) {
    const message = check(form.mats[field], rule)
    if (message) errors[field] = message
  }
  for (const field of Object.keys(form.costs) as CostField[]) {
    const message = check(form.costs[field], { min: 0, max: Number.MAX_SAFE_INTEGER })
    if (message) errors[field] = message
  }
  if (!errors.margin_min && !errors.margin_max && Number(form.mats.margin_min) > Number(form.mats.margin_max)) {
    errors.margin_max = 'Must be at least the low margin'
  }
  if (Object.keys(errors).length) return { errors }

  const num = (field: MatField) => Number(form.mats[field])
  const costs = Object.fromEntries(Object.entries(form.costs).map(([k, v]) => [k, Number(v)])) as Required<CostInputs>
  return {
    input: {
      vehicle,
      unit: form.unit,
      route_length: num('route_length'),
      route_width: num('route_width'),
      mat_length: num('mat_length'),
      mat_width: num('mat_width'),
      layers: form.layers,
      margin_min: num('margin_min') / 100,
      margin_max: num('margin_max') / 100,
      mats_in_inventory: num('mats_in_inventory'),
      costs,
    },
  }
}
