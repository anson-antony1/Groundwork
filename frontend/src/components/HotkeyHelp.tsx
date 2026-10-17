import { Keyboard, X } from 'lucide-react'
import { API_MODE } from '../api/config'
import { NAV } from './nav'

const EXTRA: [string, string][] = [
  ['V', 'Switch Pickup ↔ Heavy truck'],
  ['Esc', 'Collapse the STOP WORK takeover or close a dialog'],
  ['Shift + Alt + R', 'Reset demo (or hold the logo for 2 s)'],
  ['?', 'This help'],
]

export function HotkeyHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  const rows: [string, string][] = [...NAV.map((n): [string, string] => [n.key, n.label]), ...EXTRA]
  if (API_MODE === 'mock') rows.push(['Shift + M', 'Mock rehearsal controls'])
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="hotkeys-title" className="fixed inset-0 z-[1900] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[4px] border-2 border-line-hi bg-panel p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="hotkeys-title" className="flex items-center gap-2 text-xl label-caps">
            <Keyboard aria-hidden className="size-6 text-accent" /> Keyboard shortcuts
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-[3px] p-1 text-muted hover:bg-steel-hi">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <dl className="mt-4 flex flex-col">
          {rows.map(([key, what]) => (
            <div key={key} className="flex items-center justify-between gap-4 border-b border-line/60 py-2">
              <dt>{what}</dt>
              <dd>
                <kbd className="rounded-[3px] border border-line-hi px-2 py-0.5 font-display text-[0.9rem]">{key}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
