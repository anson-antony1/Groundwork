// In-memory state for the mock backend (mock mode only). Mirrors backend DemoState and repositories.
import type { BriefingView, ReportView } from '../api/proposed'
import type { DeviceEvent, Reading, TimelineEvent, Vehicle } from '../api/types'

export type Fault = 'none' | 'offline' | 'error500' | 'rate429' | 'slow'

export interface MockDemoState {
  replayActive: boolean
  replayScenarioId: string | null
  replaySource: string | null
  replayStartedAt: string | null
  acknowledgedAt: string | null
  crewFlagAt: string | null
  /** Like the backend default: the beacon evaluates the heavy truck. */
  demoVehicle: Vehicle
}

export interface SensorSimState {
  /** False = USB unplugged: no readings arrive, so the beacon goes UNKNOWN / NO LINK. */
  plugged: boolean
  /** Stream as "sensor_replay" (shown as Recorded demo), like `serial_bridge.py --replay`. */
  recorded: boolean
  lightConnected: boolean
  baroConnected: boolean
  /** Moisture the tray is drifting toward (pour water / dry tray). */
  target: number
  moisture: number
  light: number
  pressure: number
  temp: number
  seq: number
  bootedAt: number
}

function initialDemo(): MockDemoState {
  return {
    replayActive: false,
    replayScenarioId: null,
    replaySource: null,
    replayStartedAt: null,
    acknowledgedAt: null,
    crewFlagAt: null,
    demoVehicle: 'heavy_truck',
  }
}

function initialSensor(now = Date.now()): SensorSimState {
  return {
    plugged: true,
    recorded: false,
    lightConnected: true,
    baroConnected: true,
    target: 22,
    moisture: 22,
    light: 38,
    pressure: 1012.8,
    temp: 24.6,
    seq: 0,
    bootedAt: now,
  }
}

export const db = {
  demo: initialDemo(),
  sensor: initialSensor(),
  readings: [] as Reading[],
  deviceEvents: [] as DeviceEvent[],
  reports: [] as ReportView[],
  timeline: [] as TimelineEvent[],
  briefings: [] as BriefingView[],
  fault: 'none' as Fault,
  aiTaggerOnline: true,
}

export const READING_HISTORY_LIMIT = 5000

/** Clears everything, as a backend restart would. */
export function resetDb(now = Date.now()): void {
  db.demo = initialDemo()
  db.sensor = initialSensor(now)
  db.readings = []
  db.deviceEvents = []
  db.reports = []
  db.timeline = []
  db.briefings = []
  db.fault = 'none'
  db.aiTaggerOnline = true
  notify()
}

export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export const iso = (ms: number) => new Date(ms).toISOString()

// Subscriptions let the MockControls panel re-render when mock state changes.
let version = 0
const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getVersion(): number {
  return version
}

export function notify(): void {
  version++
  listeners.forEach((listener) => listener())
}
