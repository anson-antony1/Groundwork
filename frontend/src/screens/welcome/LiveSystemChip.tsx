import { ArrowUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { API_MODE, LIVE_URL } from '../../api/config'
import { cx } from '../../components/cx'

type LiveState = 'waking' | 'online' | 'unreachable'

const RETRY_MS = 4000
const GIVE_UP_MS = 150_000

/**
 * On the always-up demo site, links to the live system and shows whether it's awake. The free host
 * sleeps after 15 idle minutes; this ping also wakes it. It loads the live app's favicon as an image,
 * which succeeds only once the real app answers (not the host's wake-up page) and needs no CORS.
 */
export function LiveSystemChip() {
  const [state, setState] = useState<LiveState>('waking')
  useEffect(() => {
    if (!LIVE_URL || API_MODE === 'live') return
    const started = Date.now()
    let timer = 0
    let img: HTMLImageElement | null = null
    const ping = () => {
      img = new Image()
      img.onload = () => setState('online')
      img.onerror = () => {
        if (Date.now() - started > GIVE_UP_MS) setState('unreachable')
        else timer = window.setTimeout(ping, RETRY_MS)
      }
      img.src = `${LIVE_URL}/favicon.svg?ping=${Date.now()}`
    }
    ping()
    return () => {
      window.clearTimeout(timer)
      if (img) img.onload = img.onerror = null
    }
  }, [])

  if (!LIVE_URL || API_MODE === 'live') return null
  const text = state === 'online' ? 'online' : state === 'waking' ? 'waking up (about a minute)' : "not answering; try again shortly"
  return (
    <a
      href={LIVE_URL}
      className="inline-flex min-h-11 items-center gap-2 self-start rounded-[3px] border border-line-hi px-3 text-[0.82rem] label-caps hover:bg-steel-hi"
    >
      <span
        aria-hidden
        className={cx('size-2.5 rounded-full', state === 'online' ? 'bg-go' : state === 'waking' ? 'animate-pulse bg-caution' : 'border border-unknown')}
      />
      Live system · {text}
      <ArrowUpRight aria-hidden className="size-4 text-muted" />
    </a>
  )
}
