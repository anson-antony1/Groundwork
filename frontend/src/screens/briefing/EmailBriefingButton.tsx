import { Loader2, Mail } from 'lucide-react'
import { useState } from 'react'

/** The n8n webhook that emails the newest saved briefing. Override with VITE_N8N_EMAIL_URL in frontend/.env.local. */
const EMAIL_URL: string = import.meta.env.VITE_N8N_EMAIL_URL || 'http://localhost:5678/webhook/groundwork-email'

type State = 'idle' | 'sending' | 'sent' | 'failed'

/** Asks n8n to email the latest saved 6 PM plan. n8n is a separate program; the backend never sends email. */
export function EmailBriefingButton({ disabled }: { disabled?: boolean }) {
  const [state, setState] = useState<State>('idle')

  async function send() {
    setState('sending')
    try {
      const res = await fetch(EMAIL_URL, { method: 'GET' })
      setState(res.ok ? 'sent' : 'failed')
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || state === 'sending'}
        onClick={() => void send()}
        className="flex min-h-12 items-center gap-2 rounded-[3px] border-2 border-line-hi px-4 label-caps hover:bg-steel-hi disabled:opacity-60"
      >
        {state === 'sending' ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Mail aria-hidden className="size-5" />}
        {state === 'sending' ? 'Sending…' : 'Email this plan'}
      </button>
      {state === 'sent' && (
        <p role="status" className="text-[0.8rem] text-muted">
          Sent. Check your inbox.
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="max-w-64 text-right text-[0.8rem] text-stop-glow">
          Couldn’t reach n8n. Make sure it is running and the workflow is Active.
        </p>
      )}
    </div>
  )
}
