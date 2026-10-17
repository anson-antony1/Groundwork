import { CircleCheckBig, KeyRound, Loader2, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { API_MODE, hasEndpoint } from '../api/config'
import { ApiError, describeError } from '../api/errors'
import { PROPOSED_ENDPOINTS } from '../api/proposed'
import { useReplayControl, useResetDemo } from '../api/queries'
import { useServerCtx } from '../api/serverCtx'
import { useDemoUi } from '../state/demoUiContext'

const TOKEN_KEY = 'groundwork.sensorToken'

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Storage blocked: the operator types it again next time.
  }
}

/**
 * Reset between judge groups (README §14.3): POST /api/v1/demo/reset, then the UI vehicle back to Pickup.
 * The sensor token is typed by the operator (kept for this browser session), never bundled into the app.
 */
export function ResetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reset = useResetDemo()
  const { stop } = useReplayControl()
  const { replay } = useServerCtx()
  const { setVehicle } = useDemoUi()
  const [, navigate] = useLocation()
  const available = hasEndpoint(PROPOSED_ENDPOINTS.demoReset)
  const [token, setToken] = useState(() => readToken() || (API_MODE === 'mock' ? 'dev-sensor-token' : ''))
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    setDone(false)
    reset.reset()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open])

  if (!open) return null

  const finish = () => {
    setVehicle('pickup')
    navigate('/')
    setDone(true)
    window.setTimeout(onClose, 2500)
  }

  const confirm = () => {
    if (available) {
      reset.mutate(token.trim(), {
        onSuccess: () => {
          saveToken(token.trim())
          finish()
        },
      })
    } else {
      // Without the endpoint, do what the UI can: end any replay and reset the vehicle.
      if (replay?.active) stop.mutate()
      finish()
    }
  }

  const rejected = reset.error instanceof ApiError && reset.error.status === 401

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="reset-title" className="fixed inset-0 z-[1900] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[4px] border-2 border-line-hi bg-panel p-6 shadow-[0_24px_60px_rgb(0_0_0/0.7)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="reset-title" className="flex items-center gap-2.5 font-display text-3xl font-bold tracking-wide uppercase">
            <RotateCcw aria-hidden className="size-7 text-accent" /> Reset demo
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-[3px] p-1 text-muted hover:bg-steel-hi">
            <X aria-hidden className="size-6" />
          </button>
        </div>

        {done ? (
          <div className="mt-5 flex flex-col items-center gap-3 text-center">
            <CircleCheckBig aria-hidden className="size-14 text-ink" />
            <p className="text-xl font-semibold">Demo reset</p>
            <p className="text-muted">Probe back in the dry tray, wipe it, refill the cup. Check the beacon shows green GO.</p>
          </div>
        ) : (
          <>
            <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5">
              {available ? (
                <>
                  <li>Ends any storm replay</li>
                  <li>Clears demo-session crew reports and beacon acknowledgments</li>
                  <li>Re-arms the beacon alarm</li>
                </>
              ) : (
                <>
                  <li>Ends any storm replay</li>
                  <li className="text-caution">The backend has no reset endpoint yet: crew reports and acknowledgments stay until it restarts</li>
                </>
              )}
              <li>Sets the dashboard vehicle back to Pickup and returns to the map</li>
            </ul>

            {available && (
              <label className="mt-5 flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-[0.8rem] text-muted label-caps">
                  <KeyRound aria-hidden className="size-4" /> Sensor token
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="min-h-12 rounded-[3px] border-2 border-line-hi bg-bg px-3 text-lg outline-none focus:border-accent"
                />
                <span className="text-[0.78rem] text-muted">Kept for this browser session only; never stored in the app.</span>
              </label>
            )}

            {reset.isError && (
              <p role="alert" className="mt-3 text-caution">
                {rejected ? 'Token rejected. Check GROUNDWORK_SENSOR_TOKEN on the backend.' : describeError(reset.error)}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="min-h-12 rounded-[3px] border-2 border-line-hi px-5 label-caps hover:bg-steel-hi">
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                disabled={reset.isPending || (available && !token.trim())}
                onClick={confirm}
                className="flex min-h-12 items-center gap-2 rounded-[3px] bg-accent px-5 text-accent-ink label-caps disabled:opacity-50"
              >
                {reset.isPending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <RotateCcw aria-hidden className="size-5" />}
                Reset demo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
