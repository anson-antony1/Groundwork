import { CloudRain, Droplets, Gauge, Layers, OctagonX, Thermometer, Wind } from 'lucide-react'
import type { ReactNode } from 'react'
import { BeaconReplica } from '../../components/BeaconReplica'
import { Card } from '../../components/Card'
import { MissingValue, ProvenanceLine, QualityChip } from '../../components/Provenance'
import { StatusMarker } from '../../components/StatusMarker'
import { StatusTag, WeatherTag } from '../../components/StatusTag'
import { VehicleSwitch } from '../../components/VehicleSwitch'
import { EFFECTIVE_STATUSES, OBSERVATION_QUALITIES, WEATHER_STATES } from '../../api/types'
import { LABELS, forecastLabel } from '../../domain/provenance'

const NEUTRALS = ['bg', 'panel', 'steel', 'steel-hi', 'line', 'line-hi', 'faint', 'muted', 'ink', 'accent']
const STATUS_COLORS = ['go', 'caution', 'nogo', 'stop', 'stop-glow', 'unknown']

function Swatch({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="size-12 rounded-[3px] border border-line-hi" style={{ background: `var(--color-${name})` }} />
      <span className="text-sm">
        <span className="block label-caps">{name}</span>
        <span className="font-mono text-[0.8rem] text-muted">--color-{name}</span>
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-line pb-2 text-2xl font-bold text-ink label-caps">{title}</h2>
      {children}
    </section>
  )
}

const now = new Date().toISOString()

/** Living style tile: every token, placard, marker and beacon state in real color. */
export function StyleScreen() {
  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-10">
      <header>
        <p className="text-sm text-accent label-caps">Style tile</p>
        <h1 className="font-display text-5xl font-bold tracking-wide uppercase">Industrial field-grade, dark</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Status hues mean status and nothing else. Chrome is steel plus one cyan accent for interactive elements. Every
          status pairs a color with an icon, a label and a marker shape.
        </p>
      </header>

      <Section title="Palette">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {NEUTRALS.map((n) => (
            <Swatch key={n} name={n} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          {STATUS_COLORS.map((n) => (
            <Swatch key={n} name={n} />
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-wrap items-end gap-10">
          <div>
            <p className="font-display text-[5.5rem] leading-none font-bold num">7.4</p>
            <p className="text-sm text-muted label-caps">Hero number · Barlow Condensed 700</p>
          </div>
          <div>
            <p className="font-display text-4xl font-bold uppercase">Weather hazard</p>
            <p className="text-sm text-muted label-caps">Heading · Barlow Condensed</p>
          </div>
          <div className="max-w-md">
            <p>Body text in Barlow at an 18 px base, readable from a couple of steps back. 1.71 in · 33 mph · 81 °F</p>
            <p className="text-sm text-muted label-caps">Body · Barlow 400</p>
          </div>
          <div>
            <p className="font-lcd text-4xl">STOP WORK - ACK?</p>
            <p className="text-sm text-muted label-caps">LCD only · VT323</p>
          </div>
        </div>
      </Section>

      <Section title="Status placards">
        {(['sm', 'md', 'lg'] as const).map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-3">
            {EFFECTIVE_STATUSES.map((s) => (
              <StatusTag key={s} status={s} size={size} />
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <StatusTag status="STALE" />
          <StatusTag status="NO_LINK" />
          {EFFECTIVE_STATUSES.map((s) => (
            <StatusTag key={s} status={s} compact />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted label-caps">Weather</span>
          {WEATHER_STATES.map((w) => (
            <WeatherTag key={w} state={w} />
          ))}
        </div>
        <div className="flex items-center gap-4">
          <StatusTag status="STOP_WORK" size="xl" emphasize />
          <span className="text-muted">Hero STOP placard pulses; list placards stay still.</span>
        </div>
      </Section>

      <Section title="Map markers">
        <div className="flex flex-wrap items-end gap-8">
          {EFFECTIVE_STATUSES.map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <StatusMarker status={s} size={40} />
              <StatusTag status={s} compact size="sm" />
            </div>
          ))}
          <div className="flex flex-col items-center gap-2">
            <StatusMarker status="STOP_WORK" size={40} hatched />
            <span className="text-xs text-muted label-caps">Replay · hatched</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <StatusMarker status="MATS_FOR_REVIEW" size={40} dashed />
            <span className="text-xs text-muted label-caps">Simulated · dashed</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <StatusMarker status="GO_FOR_REVIEW" size={40} selected />
            <span className="text-xs text-muted label-caps">Selected</span>
          </div>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card
            title="Weather hazard · all vehicles"
            icon={<CloudRain aria-hidden className="size-4" />}
            right={<WeatherTag state="CAUTION" size="sm" />}
            footer={<ProvenanceLine>{forecastLabel('Open-Meteo', '2026-10-17')}</ProvenanceLine>}
          >
            <div className="flex items-end gap-4">
              <span className="font-display text-[5.5rem] leading-[0.85] font-bold num">7.4</span>
              <span className="pb-2 text-2xl text-muted">/ 10</span>
            </div>
            <div className="mt-4 h-3 rounded-full bg-steel">
              <div className="h-3 w-[74%] rounded-full bg-ink/80" />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[0.95rem]">
              {[
                [<Droplets key="i" className="size-4" />, '7-day rainfall', '1.71 in'],
                [<Wind key="i" className="size-4" />, 'Max gust', '33 mph'],
                [<Thermometer key="i" className="size-4" />, 'Apparent temp', '81 °F'],
                [<Gauge key="i" className="size-4" />, 'NWS alerts', null],
              ].map(([icon, label, value]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3 border-b border-line/70 pb-2">
                  <dt className="flex items-center gap-2 text-muted">
                    {icon}
                    {label}
                  </dt>
                  <dd className="font-semibold num">{value ?? <MissingValue what={String(label)} />}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card
            title="Ground access · per vehicle"
            icon={<Layers aria-hidden className="size-4" />}
            right={<VehicleSwitch />}
            tone="caution"
            footer={<ProvenanceLine>{LABELS.prototypePolicy}</ProvenanceLine>}
          >
            <div className="flex flex-col gap-4">
              <StatusTag status="MATS_FOR_REVIEW" size="lg" />
              <p className="text-muted">Soft ground: ground protection likely needed for this vehicle.</p>
              <div className="flex gap-6 text-[0.95rem]">
                <span className="flex items-center gap-2">
                  Pickup <StatusTag status="GO_FOR_REVIEW" compact size="sm" />
                </span>
                <span className="flex items-center gap-2">
                  Heavy truck <StatusTag status="MATS_FOR_REVIEW" compact size="sm" />
                </span>
              </div>
            </div>
          </Card>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {OBSERVATION_QUALITIES.map((q) => (
            <QualityChip key={q} quality={q} />
          ))}
          <MissingValue what="rain forecast" />
        </div>
      </Section>

      <Section title="Beacon mirror states">
        <div className="grid gap-6 xl:grid-cols-3">
          <BeaconReplica linked display={{ code: 'GO', lcd_line1: 'DEMO TRAY   HVY', lcd_line2: 'GO FOR REVIEW', alarm: false, acknowledged_at: null }} />
          <BeaconReplica linked display={{ code: 'MATS', lcd_line1: 'DEMO TRAY   HVY', lcd_line2: 'MATS FOR REVIEW', alarm: false, acknowledged_at: null }} />
          <BeaconReplica linked display={{ code: 'STOP', lcd_line1: 'DEMO TRAY   HVY', lcd_line2: 'STOP WORK - ACK?', alarm: true, acknowledged_at: null }} />
          <BeaconReplica linked display={{ code: 'STOP', lcd_line1: 'DEMO TRAY   HVY', lcd_line2: 'STOP WORK - ACKD', alarm: false, acknowledged_at: now }} />
          <BeaconReplica linked display={{ code: 'UNKNOWN', lcd_line1: 'DEMO TRAY   HVY', lcd_line2: 'NO SENSOR DATA', alarm: false, acknowledged_at: null }} />
          <BeaconReplica linked={false} display={null} />
        </div>
      </Section>

      <Section title="STOP WORK bar">
        <div className="flex items-center gap-4 overflow-hidden rounded-[4px] border-2 border-stop bg-stop/20 pr-5">
          <span aria-hidden className="w-6 self-stretch hazard-stripes" />
          <OctagonX aria-hidden className="size-9 text-stop-glow" />
          <span className="font-display text-3xl font-bold tracking-wide text-ink uppercase">Stop work · all vehicles</span>
          <span className="text-muted">Historical replay • source not attached</span>
        </div>
      </Section>
    </div>
  )
}
