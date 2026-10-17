import { Calculator, ChevronDown, Loader2, OctagonX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { describeError } from '../../api/errors'
import type { SiteDetailView } from '../../api/proposed'
import { useEvaluate } from '../../api/queries'
import { SupervisorOnly } from '../../auth/AccountButton'
import { useCan } from '../../auth/session'
import type { EvaluationInput, Vehicle } from '../../api/types'
import { Card } from '../../components/Card'
import { cx } from '../../components/cx'
import { NumberField } from '../../components/NumberField'
import { ProvenanceLine } from '../../components/Provenance'
import { Segmented } from '../../components/Segmented'
import { StatusTag } from '../../components/StatusTag'
import { useDebounced } from '../../hooks/useDebounced'
import { VEHICLE_LABEL, fmtMoney } from '../../domain/format'
import { LABELS } from '../../domain/provenance'
import { accessVisual } from '../../domain/status'
import { DEFAULT_FORM, toEvaluationInput } from './inputs'
import type { CostField, MatField, PlanForm } from './inputs'

const MATS_COSTS: [CostField, string][] = [
  ['mats_rental', 'Mat rental'],
  ['delivery', 'Delivery'],
  ['installation', 'Installation'],
  ['removal', 'Removal'],
  ['delay_not_prevented', 'Delay mats won’t prevent'],
]
const POSTPONE_COSTS: [CostField, string][] = [
  ['paid_idle_labor', 'Paid idle labor'],
  ['idle_equipment', 'Idle equipment'],
  ['rescheduling', 'Rescheduling'],
  ['extra_contract_cost', 'Extra contract cost'],
  ['idle_hours', 'Idle hours (delay)'],
  ['labor_rate_per_hour', 'Labor rate per hour'],
  ['equipment_rate_per_hour', 'Equipment rate per hour'],
]

function differenceSentence(diff: number): string {
  if (diff > 0) return `Postponing is modeled to cost ${fmtMoney(diff)} more than staging mats.`
  if (diff < 0) return `Staging mats is modeled to cost ${fmtMoney(-diff)} more than postponing.`
  return 'The modeled costs are equal.'
}

/**
 * Mat staging range and mats-vs-postpone comparison (README §6, P8, P9). The UI only collects
 * assumptions; POST /sites/{id}/evaluate computes every count and dollar figure shown here.
 */
export function MatsCostPanel({ site, vehicle }: { site: SiteDetailView; vehicle: Vehicle }) {
  const [form, setForm] = useState<PlanForm>(DEFAULT_FORM)
  const [editing, setEditing] = useState(false)
  const parsed = toEvaluationInput(form, vehicle)
  const errors = 'errors' in parsed ? parsed.errors : {}

  // Debounce the serialized body: identical content never re-triggers a request.
  const bodyJson = 'input' in parsed ? JSON.stringify(parsed.input) : null
  const debounced = useDebounced(bodyJson, 400)
  const input = useMemo(() => (debounced ? (JSON.parse(debounced) as EvaluationInput) : null), [debounced])
  const statusKey = `${site.weather_state}|${site.access_call[vehicle]}|${site.effective_status[vehicle]}`
  // POST /evaluate is supervisor-only with auth on: don't send it for crew, show why instead.
  const { can } = useCan()
  const planning = can('planMats')
  const evaluation = useEvaluate(site.id, planning ? input : null, statusKey)
  const result = evaluation.data?.data
  const recalculating = evaluation.isPlaceholderData || evaluation.isFetching || bodyJson !== debounced

  const setMat = (field: MatField, text: string) => setForm((f) => ({ ...f, mats: { ...f.mats, [field]: text } }))
  const setCost = (field: CostField, text: string) => setForm((f) => ({ ...f, costs: { ...f.costs, [field]: text } }))
  const unit = form.unit

  if (!planning) {
    return (
      <Card title="Mats and cost for this site" icon={<Calculator aria-hidden className="size-4" />}>
        <SupervisorOnly what="plan mats and compare costs" />
      </Card>
    )
  }

  const hasErrors = Object.keys(errors).length > 0
  const showInputs = editing || hasErrors
  const mats = result?.mats_estimate

  return (
    <Card
      title="Mats and cost for this site"
      icon={<Calculator aria-hidden className="size-4" />}
      right={<span className="rounded-[3px] border border-dashed border-line-hi px-2 py-1 text-[0.75rem] text-muted label-caps">{LABELS.scenarioAssumption}</span>}
      footer={<ProvenanceLine>The backend computes every count and dollar figure shown from the assumptions you enter.</ProvenanceLine>}
    >
      <div className="flex flex-col gap-5">
        <p className="text-muted">Only needed when a vehicle shows MATS. The numbers come from the assumptions under Edit assumptions; change any of them.</p>

        <div className={cx('grid gap-4 transition-opacity md:grid-cols-2', recalculating && 'opacity-60')} aria-live="polite">
          <section aria-label="Mat estimate" className="flex flex-col gap-2 rounded-[4px] border-2 border-line bg-bg/40 p-4">
            <p className="text-[0.75rem] text-muted label-caps">Mats to stage · {VEHICLE_LABEL[vehicle]}</p>
            {result && mats ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-[3.6rem] leading-none font-bold">
                    {mats.min_estimate === mats.max_estimate ? mats.max_estimate : `${mats.min_estimate}–${mats.max_estimate}`}
                  </span>
                  <span className="text-xl text-muted">mats</span>
                </p>
                <p className={cx('text-lg font-semibold', mats.shortfall > 0 ? 'text-caution' : 'text-ink')}>
                  {/* planned_quantity arrived with P8; an older backend leaves it out. */}
                  {mats.shortfall > 0
                    ? `${mats.shortfall} short of the ${mats.mats_in_inventory} on hand (plan ${mats.planned_quantity ?? mats.max_estimate})`
                    : `Covered by the ${mats.mats_in_inventory} on hand (plan ${mats.planned_quantity ?? mats.max_estimate})`}
                </p>
                {result.notes.length > 0 ? (
                  <p className="flex items-center gap-2 rounded-[3px] border border-stop bg-stop/15 px-3 py-2 font-semibold">
                    <OctagonX aria-hidden className="size-5 shrink-0 text-stop-glow" />
                    {result.notes[0]}
                  </p>
                ) : result.mats_recommended ? (
                  <p className="flex flex-wrap items-center gap-2">
                    <StatusTag status="MATS_FOR_REVIEW" size="sm" /> Mats recommended for the {VEHICLE_LABEL[vehicle].toLowerCase()}
                  </p>
                ) : (
                  <p className="text-muted">
                    Not needed for the {VEHICLE_LABEL[vehicle].toLowerCase()} (ground: {accessVisual(result.access_call).label}). This shows what staging would take.
                  </p>
                )}
              </>
            ) : evaluation.isError ? (
              <p role="alert" className="text-caution">
                Couldn’t calculate: {describeError(evaluation.error)}
              </p>
            ) : hasErrors ? (
              <p className="text-muted">Fix the highlighted inputs to calculate.</p>
            ) : (
              <p className="flex items-center gap-2 text-muted">
                <Loader2 aria-hidden className="size-4 animate-spin" /> Calculating…
              </p>
            )}
          </section>

          <section aria-label="Mats versus postponing" className="flex flex-col gap-2 rounded-[4px] border-2 border-line-hi bg-bg/40 p-4">
            <p className="flex flex-wrap items-baseline justify-between gap-2 text-[0.75rem] text-muted label-caps">
              Mats vs postponing the job <span className="text-caution">{LABELS.illustrativeCost}</span>
            </p>
            {result ? (
              <>
                <p className="font-display text-4xl font-bold">{fmtMoney(Math.abs(result.cost_comparison.modeled_difference))}</p>
                <p className="text-lg">{differenceSentence(result.cost_comparison.modeled_difference)}</p>
                <p className="text-[0.88rem] text-muted">
                  Stage mats {fmtMoney(result.cost_comparison.mats_option)} · postpone {fmtMoney(result.cost_comparison.postpone_option)}
                </p>
                <p className="text-[0.82rem] text-muted">{result.cost_comparison.label} These defaults are placeholders: enter vendor quotes and crew costs.</p>
              </>
            ) : (
              <p className="text-muted">—</p>
            )}
          </section>
        </div>

        <div>
          <button
            type="button"
            aria-expanded={showInputs}
            onClick={() => setEditing((e) => !e)}
            className="flex min-h-10 items-center gap-2 rounded-[3px] border-2 border-line-hi px-3 text-[0.85rem] text-ink label-caps hover:bg-steel-hi"
          >
            {showInputs ? 'Hide assumptions' : 'Edit assumptions'} <ChevronDown aria-hidden className={cx('size-4', showInputs && 'rotate-180')} />
          </button>
        </div>

        {showInputs && (
          <div className="grid gap-8 xl:grid-cols-2">
            <section aria-label="Mat assumptions" className="flex flex-col gap-4">
              <h3 className="text-lg label-caps">Route and mats</h3>
              <div className="flex flex-wrap items-center gap-4">
                <Segmented label="Units" value={form.unit} options={[{ value: 'ft', label: 'Feet' }, { value: 'm', label: 'Meters' }] as const} onChange={(u) => setForm((f) => ({ ...f, unit: u }))} />
                <Segmented
                  label="Layers"
                  value={String(form.layers) as '1' | '2' | '3'}
                  options={[{ value: '1', label: '1 layer' }, { value: '2', label: '2' }, { value: '3', label: '3' }] as const}
                  onChange={(l) => setForm((f) => ({ ...f, layers: Number(l) }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField label="Route length" unit={unit} value={form.mats.route_length} onChange={(t) => setMat('route_length', t)} error={errors.route_length} />
                <NumberField label="Route width" unit={unit} value={form.mats.route_width} onChange={(t) => setMat('route_width', t)} error={errors.route_width} />
                <NumberField label="Mat length" unit={unit} value={form.mats.mat_length} onChange={(t) => setMat('mat_length', t)} error={errors.mat_length} />
                <NumberField label="Mat width" unit={unit} value={form.mats.mat_width} onChange={(t) => setMat('mat_width', t)} error={errors.mat_width} />
                <NumberField label="Margin low" unit="%" value={form.mats.margin_min} onChange={(t) => setMat('margin_min', t)} error={errors.margin_min} />
                <NumberField label="Margin high" unit="%" value={form.mats.margin_max} onChange={(t) => setMat('margin_max', t)} error={errors.margin_max} />
                <NumberField label="Mats on hand" unit="mats" value={form.mats.mats_in_inventory} onChange={(t) => setMat('mats_in_inventory', t)} error={errors.mats_in_inventory} className="col-span-2" />
              </div>
              {mats && (
                <div className="flex flex-col gap-1.5">
                  {mats.steps?.length ? (
                    <ol aria-label="How the backend calculated this" className="flex flex-col gap-0.5 font-mono text-[0.78rem] text-muted">
                      {mats.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="font-mono text-[0.78rem] text-muted">{mats.method}</p>
                  )}
                  <p className="text-[0.82rem] text-muted">{mats.caveat}</p>
                </div>
              )}
            </section>

            <section aria-label="Cost assumptions" className="flex flex-col gap-4">
              <h3 className="text-lg label-caps">Costs</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['Stage mats', MATS_COSTS, result?.cost_comparison.mats_option],
                    ['Postpone the job', POSTPONE_COSTS, result?.cost_comparison.postpone_option],
                  ] as const
                ).map(([title, fields, total]) => (
                  <div key={title} className="flex flex-col gap-3 rounded-[4px] border border-line bg-steel/50 p-4">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="label-caps">{title}</span>
                      <span className={cx('font-display text-3xl font-bold transition-opacity', recalculating && 'opacity-60')}>{total === undefined ? '—' : fmtMoney(total)}</span>
                    </p>
                    {title === 'Postpone the job' && <p className="text-[0.8rem] text-muted">Idle hours × (labor + equipment rate) is added to the flat amounts.</p>}
                    {fields.map(([field, label]) => (
                      <NumberField key={field} label={label} prefix={field === 'idle_hours' ? undefined : '$'} unit={field === 'idle_hours' ? 'h' : undefined} value={form.costs[field]} onChange={(t) => setCost(field, t)} error={errors[field]} step={50} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </Card>
  )
}
