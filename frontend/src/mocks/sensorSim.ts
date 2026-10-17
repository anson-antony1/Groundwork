// Simulated site beacon for mock mode: a 1 Hz reading stream like hardware/serial_bridge.py posts,
// plus touch/button events. Moisture drifts toward a target, so "pour water" climbs over several
// seconds the way real soil soaks through.
import type { DeviceEvent } from '../api/types'
import { READING_HISTORY_LIMIT, db, iso, newId, notify } from './db'
import { DEMO_DEVICE_ID, DEMO_SITE_ID, demoStatus, recordTimeline } from './rules'

const DRY_ADC = 260
const WET_ADC = 820
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const noise = (amp: number) => (Math.random() * 2 - 1) * amp
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits

/** Tray targets in the 0–100 moisture index. With the demo policy: 58 = heavy-truck MATS, pickup GO. */
export const MOISTURE = { dry: 22, pour: 58, soak: 74 } as const

export function tickSensor(now = Date.now()): void {
  const s = db.sensor
  // The tray keeps changing physically even when the USB link is down; we just stop hearing about it.
  s.moisture = clamp(s.moisture + (s.target - s.moisture) * 0.22 + noise(0.45), 0, 100)
  s.light = clamp(s.light + noise(0.7), 0, 100)
  s.pressure += noise(0.025) - 0.0015
  s.temp += noise(0.015)
  if (!s.plugged) return

  s.seq++
  const moisture = round(s.moisture, 1)
  db.readings.push({
    device_id: DEMO_DEVICE_ID,
    site_id: DEMO_SITE_ID,
    seq: s.seq,
    raw_adc: Math.round(DRY_ADC + ((WET_ADC - DRY_ADC) * moisture) / 100),
    moisture_index: moisture,
    // Disconnected modules are omitted, never sent as zeros (README §5.7).
    light_raw: s.lightConnected ? Math.round(s.light * 10.23) : null,
    light_index: s.lightConnected ? round(s.light, 1) : null,
    pressure_hpa: s.baroConnected ? round(s.pressure, 2) : null,
    temp_c: s.baroConnected ? round(s.temp, 1) : null,
    calibration: 'dry_wet_2point_v1',
    recorded_at: iso(now),
    received_at: iso(now),
    mode: s.recorded ? 'sensor_replay' : 'sensor_demo',
  })
  if (db.readings.length > READING_HISTORY_LIMIT) db.readings.splice(0, db.readings.length - READING_HISTORY_LIMIT)
  notify()
}

/** Touch acknowledges a STOP alarm (never clears it); a long button press flags the site for review. */
export function recordDeviceEvent(event: DeviceEvent['event'], now = Date.now()): DeviceEvent {
  const [statusAtEvent] = demoStatus(now)
  if (event === 'ack_touch') {
    if (statusAtEvent === 'STOP_WORK' && db.demo.acknowledgedAt === null) db.demo.acknowledgedAt = iso(now)
  } else {
    db.demo.crewFlagAt = iso(now)
  }
  const record: DeviceEvent = {
    id: newId('evt'),
    device_id: DEMO_DEVICE_ID,
    site_id: DEMO_SITE_ID,
    event,
    seq: ++db.sensor.seq,
    status_at_event: statusAtEvent,
    recorded_at: iso(now),
    received_at: iso(now),
    mode: db.sensor.recorded ? 'sensor_replay' : 'sensor_demo',
  }
  db.deviceEvents.push(record)
  recordTimeline(event, `${event} from ${DEMO_DEVICE_ID} while ${statusAtEvent}`, now, DEMO_SITE_ID, record.id)
  notify()
  return record
}

export const sensorControls = {
  setTarget(target: number) {
    db.sensor.target = target
    notify()
  },
  setPlugged(plugged: boolean) {
    db.sensor.plugged = plugged
    notify()
  },
  setRecorded(recorded: boolean) {
    db.sensor.recorded = recorded
    notify()
  },
  setModules(light: boolean, baro: boolean) {
    db.sensor.lightConnected = light
    db.sensor.baroConnected = baro
    notify()
  },
}

let timer: number | undefined

export function startSensorSim(): void {
  if (timer !== undefined) return
  tickSensor()
  timer = window.setInterval(() => tickSensor(), 1000)
}
