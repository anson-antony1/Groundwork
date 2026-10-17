import { Droplets, Gauge, Sun, Thermometer, Unplug } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Reading } from '../../api/types'
import { cx } from '../../components/cx'
import { QualityChip } from '../../components/Provenance'
import { SplitFlap } from '../../components/SplitFlap'
import { cToF, fmtAgo } from '../../domain/format'
import { LABELS, sensorReplayLabel } from '../../domain/provenance'

/** A module that isn't plugged in sends nothing (README §5.7). Shown as such, never as zero. */
function NoValue({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[1.05rem] text-unknown">
      <Unplug aria-hidden className="size-4" />
      <span className="border-b border-dashed border-unknown/70">{text}</span>
    </span>
  )
}

interface TileProps {
  label: string
  icon: LucideIcon
  value: number | null | undefined
  digits: number
  unit: string
  provenance: ReactNode
  hero?: boolean
  stale: boolean
  /** No reading has arrived at all (vs. a reading without this module's value). */
  noReading: boolean
}

function Tile({ label, icon: Icon, value, digits, unit, provenance, hero, stale, noReading }: TileProps) {
  const present = typeof value === 'number' && !stale
  return (
    <div className={cx('flex flex-col gap-2 rounded-[4px] border border-line bg-panel p-4', hero && 'border-accent/50 bg-gradient-to-br from-accent/10 to-transparent sm:col-span-2')}>
      <p className="flex items-center gap-2 text-[0.8rem] text-muted label-caps">
        <Icon aria-hidden className="size-4" />
        {label}
      </p>
      {present ? (
        <p className="flex items-baseline gap-1.5">
          {hero ? (
            // The hero reading flips like a departures board; padded so 99.9 to 100.0 adds no card.
            <SplitFlap text={value.toFixed(digits).padStart(digits ? digits + 4 : 3, ' ')} className="font-display text-[5rem] leading-none font-bold" />
          ) : (
            <span className="font-display text-[2.6rem] leading-none font-bold num">{value.toFixed(digits)}</span>
          )}
          <span className="text-lg text-muted">{unit}</span>
        </p>
      ) : stale && typeof value === 'number' ? (
        <p className="font-display text-[2.2rem] leading-none font-bold text-unknown">—</p>
      ) : (
        <NoValue text={noReading ? 'No reading yet' : 'Not connected'} />
      )}
      <div className="text-[0.78rem] leading-snug text-muted">{provenance}</div>
    </div>
  )
}

export function ReadingTiles({ reading, now, stale }: { reading: Reading | null; now: number; stale: boolean }) {
  const when = reading ? `recorded ${fmtAgo(reading.recorded_at, now)}` : 'no reading yet'
  const quality = reading ? (
    <QualityChip
      quality={reading.mode}
      label={reading.mode === 'sensor_replay' ? sensorReplayLabel(reading.calibration) : undefined}
      className="ml-1"
    />
  ) : null
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      <Tile
        hero
        label="Soil moisture index · demo tray"
        icon={Droplets}
        value={reading?.moisture_index}
        digits={1}
        unit="/ 100"
        stale={stale}
        noReading={!reading}
        provenance={
          <>
            {LABELS.demoSensor} · {when}
            {quality}
            <br />
            Calibrated 0–100 relative scale, not volumetric water content
            {reading?.calibration && ` · ${reading.calibration}`}
            {reading?.raw_adc != null && ` · raw ADC ${reading.raw_adc}`}
          </>
        }
      />
      <Tile label="Light index" noReading={!reading} icon={Sun} value={reading?.light_index} digits={1} unit="/ 100" stale={stale} provenance={<>{LABELS.demoBeacon}</>} />
      <Tile
        label="Pressure"
        noReading={!reading}
        icon={Gauge}
        value={reading?.pressure_hpa}
        digits={1}
        unit="hPa"
        stale={stale}
        provenance={<>Station pressure, not sea-level · advisory only, never a STOP WORK trigger</>}
      />
      <Tile label="Temperature" noReading={!reading} icon={Thermometer} value={cToF(reading?.temp_c)} digits={0} unit="°F" stale={stale} provenance={<>{LABELS.demoBeacon}</>} />
    </div>
  )
}
