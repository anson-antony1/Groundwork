// Mock-mode rehearsal panel (Shift+M). It plays the other people in the §14 script, changing the
// mock server directly as Anson's beacon or Aashita's laptop would; the UI must pick changes up by
// polling, exactly as it will in the real demo.
import { FlaskConical, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useHotkeys } from '../hooks/useHotkeys'
import { useNow } from '../hooks/useNow'
import { MOCK_CONTROLS_EVENT } from '../state/mockEvents'
import { db, getVersion, notify, resetDb, subscribe } from './db'
import type { Fault } from './db'
import { handle, tagPendingReports } from './handlers'
import { demoStatus, latestReading } from './rules'
import { MOISTURE, recordDeviceEvent, sensorControls } from './sensorSim'

function Btn({ onClick, children, active }: { onClick: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-[3px] border px-2.5 text-[0.78rem] label-caps ${active ? 'border-accent bg-accent text-accent-ink' : 'border-line-hi text-ink hover:bg-steel-hi'}`}
    >
      {children}
    </button>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[0.7rem] text-faint label-caps">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

const FAULTS: [Fault, string][] = [
  ['none', 'None'],
  ['offline', 'Offline'],
  ['error500', '500'],
  ['rate429', '429'],
  ['slow', 'Slow'],
]

export default function MockControls() {
  const [open, setOpen] = useState(false)
  const now = useNow(1000)
  useSyncExternalStore(subscribe, getVersion)
  useHotkeys({ M: () => setOpen((o) => !o) })
  useEffect(() => {
    const toggle = () => setOpen((o) => !o)
    window.addEventListener(MOCK_CONTROLS_EVENT, toggle)
    return () => window.removeEventListener(MOCK_CONTROLS_EVENT, toggle)
  }, [])

  if (!open) return null

  const s = db.sensor
  const reading = latestReading()
  const [status] = demoStatus(now)
  const replay = (on: boolean) => void handle({ method: 'POST', path: `/api/v1/replay/${on ? 'start' : 'stop'}`, json: { scenario_id: 'demo-storm' } })

  return (
    <aside
      aria-label="Mock rehearsal controls"
      className="fixed right-3 bottom-3 z-[2000] flex w-[22rem] flex-col gap-3 rounded-[4px] border-2 border-dashed border-line-hi bg-panel p-4 shadow-[0_18px_40px_rgb(0_0_0/0.6)]"
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm label-caps">
          <FlaskConical aria-hidden className="size-4 text-accent" /> Mock rehearsal
        </p>
        <button type="button" aria-label="Close mock controls" onClick={() => setOpen(false)}>
          <X aria-hidden className="size-4 text-muted" />
        </button>
      </div>
      <p className="text-[0.78rem] text-muted">
        Moisture <span className="num text-ink">{reading?.moisture_index?.toFixed(1) ?? '—'}</span> → target {s.target} · beacon {status}
      </p>
      <Group title="Tray (Anson)">
        <Btn onClick={() => sensorControls.setTarget(MOISTURE.pour)} active={s.target === MOISTURE.pour}>Pour water</Btn>
        <Btn onClick={() => sensorControls.setTarget(MOISTURE.soak)} active={s.target === MOISTURE.soak}>Soak</Btn>
        <Btn onClick={() => sensorControls.setTarget(MOISTURE.dry)} active={s.target === MOISTURE.dry}>Dry tray</Btn>
      </Group>
      <Group title="Beacon">
        <Btn onClick={() => recordDeviceEvent('ack_touch')}>Touch (ack)</Btn>
        <Btn onClick={() => recordDeviceEvent('crew_flag')}>Hold 2 s (flag)</Btn>
        <Btn onClick={() => sensorControls.setPlugged(!s.plugged)} active={!s.plugged}>{s.plugged ? 'Unplug USB' : 'Plug in USB'}</Btn>
        <Btn onClick={() => sensorControls.setRecorded(!s.recorded)} active={s.recorded}>Recorded demo</Btn>
        <Btn onClick={() => sensorControls.setModules(!s.lightConnected, !s.baroConnected)} active={!s.baroConnected}>
          {s.baroConnected ? 'Unplug I2C' : 'Plug I2C'}
        </Btn>
      </Group>
      <Group title="Storm replay (Aashita)">
        <Btn onClick={() => replay(true)} active={db.demo.replayActive}>Start</Btn>
        <Btn onClick={() => replay(false)}>Stop</Btn>
      </Group>
      <Group title="Photo tagger (Rithika)">
        <Btn onClick={tagPendingReports}>Tag now</Btn>
        <Btn onClick={() => { db.aiTaggerOnline = !db.aiTaggerOnline; notify() }} active={!db.aiTaggerOnline}>
          {db.aiTaggerOnline ? 'Take offline' : 'Bring online'}
        </Btn>
      </Group>
      <Group title="API fault">
        {FAULTS.map(([fault, label]) => (
          <Btn key={fault} onClick={() => { db.fault = fault; notify() }} active={db.fault === fault}>
            {label}
          </Btn>
        ))}
      </Group>
      <Btn onClick={() => resetDb()}>Restart mock backend</Btn>
    </aside>
  )
}
