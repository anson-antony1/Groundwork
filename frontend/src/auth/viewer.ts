// "Continue as viewer" on the login page: remembered for this browser tab's session only, so a judge
// can look around without an account and the next visitor still sees the login page first.
import type { Session } from './session'

const KEY = 'groundwork.viewer'
let viewerInMemory = false

export function chooseViewer(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // Private windows can block storage; the choice then lasts until the next reload.
  }
  viewerInMemory = true
}

export function isViewer(): boolean {
  if (viewerInMemory) return true
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Screens that never send anyone to the login page: the page itself and the public front door. */
const OPEN_PATHS = ['/login', '/welcome']

/**
 * Whether to show the login page first: only when this build has Auth0, Auth0 has finished checking for an
 * existing login, nobody is logged in, and the visitor hasn't chosen to continue as a viewer.
 */
export function needsLoginPage(session: Pick<Session, 'configured' | 'ready' | 'loggedIn'>, path: string, viewer: boolean): boolean {
  if (!session.configured || !session.ready || session.loggedIn || viewer) return false
  return !OPEN_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

/** A safe in-app path from ?next=, so the login page can't be used to send people to another site. */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get('next') ?? '/'
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/'
}
