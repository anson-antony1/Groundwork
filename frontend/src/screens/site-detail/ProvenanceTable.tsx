import { ExternalLink, Table2 } from 'lucide-react'
import type { SiteDetailView } from '../../api/proposed'
import { Card } from '../../components/Card'
import { MissingValue, QualityChip } from '../../components/Provenance'
import { fieldLabel, fmtObservation, fmtWhen } from '../../domain/format'
import { observationLabel } from '../../domain/provenance'

const KIND: Record<string, string> = { forecast: 'Forecast', modeled: 'Model', survey: 'Survey', observed: 'Observed' }

/** Every input behind the site's call: value, kind, source, validity, fetch time and quality (README P2). */
export function ProvenanceTable({ site }: { site: SiteDetailView }) {
  const observed = new Set(site.observations.map((o) => o.variable))
  const missingOnly = site.missing_fields.filter((f) => !observed.has(f))
  return (
    <Card title="Data and sources" icon={<Table2 aria-hidden className="size-4" />} bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[0.88rem]">
          <thead className="text-[0.72rem] text-muted label-caps">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-normal">Input</th>
              <th className="px-3 py-2.5 font-normal">Value</th>
              <th className="px-3 py-2.5 font-normal">Kind</th>
              <th className="px-3 py-2.5 font-normal">Source</th>
              <th className="px-3 py-2.5 font-normal">Valid</th>
              <th className="px-3 py-2.5 font-normal">Fetched</th>
              <th className="px-4 py-2.5 font-normal">Quality</th>
            </tr>
          </thead>
          <tbody>
            {site.observations.map((o) => (
              <tr key={o.variable} className="border-b border-line/60" title={observationLabel(o)}>
                <td className="px-4 py-2.5 font-semibold">{fieldLabel(o.variable)}</td>
                <td className="px-3 py-2.5 num">{o.value === null ? <MissingValue what={fieldLabel(o.variable)} /> : fmtObservation(o)}</td>
                <td className="px-3 py-2.5">{KIND[o.kind] ?? o.kind}</td>
                <td className="px-3 py-2.5">
                  {o.reference_url ? (
                    <a href={o.reference_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      {o.source} <ExternalLink aria-hidden className="size-3.5" />
                    </a>
                  ) : (
                    o.source
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{fmtWhen(o.valid_at)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{fmtWhen(o.fetched_at)}</td>
                <td className="px-4 py-2.5">
                  <QualityChip quality={o.quality} />
                </td>
              </tr>
            ))}
            {missingOnly.map((f) => (
              <tr key={f} className="border-b border-line/60">
                <td className="px-4 py-2.5 font-semibold">{fieldLabel(f)}</td>
                <td className="px-3 py-2.5">
                  <MissingValue what={fieldLabel(f)} />
                </td>
                <td className="px-3 py-2.5 text-muted" colSpan={4}>
                  Not provided: the connector isn't built or returned nothing
                </td>
                <td className="px-4 py-2.5">
                  <QualityChip quality="missing" />
                </td>
              </tr>
            ))}
            {site.observations.length === 0 && missingOnly.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-muted">
                  No field inputs for this site. The demo tray is driven by its beacon sensor (see Sensor lab).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2.5 text-[0.78rem] text-muted">Coordinates: {site.location_origin}</p>
    </Card>
  )
}
