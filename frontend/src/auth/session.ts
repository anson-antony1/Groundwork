import { createContext, useContext } from 'react'
import { useHealth } from '../api/queries'

export type Role = 'crew' | 'supervisor'

export interface Session {
  /** This build has Auth0 set up (live mode with VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID). */
  configured: boolean
  /** Auth0 has finished checking for an existing login. */
  ready: boolean
  loggedIn: boolean
  name: string | null
  roles: readonly string[]
  login: () => void
  logout: () => void
}

export const ANONYMOUS: Session = {
  configured: false,
  ready: true,
  loggedIn: false,
  name: null,
  roles: [],
  login: () => {},
  logout: () => {},
}

export const SessionContext = createContext<Session>(ANONYMOUS)

export function useSession(): Session {
  return useContext(SessionContext)
}

/** Writes the backend guards (backend/app/api/*: require_role), and the roles each one accepts. */
export const NEEDS = {
  generatePlan: ['supervisor'],
  planMats: ['supervisor'],
  reviewReports: ['supervisor'],
  clearCrewFlag: ['supervisor'],
  resetDemo: ['supervisor'],
  sendReport: ['crew', 'supervisor'],
} as const satisfies Record<string, readonly Role[]>

export type Action = keyof typeof NEEDS

/**
 * Whether the viewer may take `action`. With backend auth off (the default, and the venue fallback)
 * the backend treats every caller as a demo user holding both roles, so everything stays available.
 */
export function allowed(action: Action, authOn: boolean, roles: readonly string[]): boolean {
  if (!authOn) return true
  const accepted: readonly string[] = NEEDS[action]
  return roles.some((role) => accepted.includes(role))
}

/** `can(action)` for the current viewer, using the backend's own auth switch from GET /health. */
export function useCan(): { can: (action: Action) => boolean; authOn: boolean } {
  const session = useSession()
  const authOn = useHealth().data?.data.auth === 'auth0'
  return { can: (action) => allowed(action, authOn, session.roles), authOn }
}

export function roleLabel(roles: readonly string[]): string {
  if (roles.includes('supervisor')) return 'Supervisor'
  if (roles.includes('crew')) return 'Crew'
  return 'No role'
}
