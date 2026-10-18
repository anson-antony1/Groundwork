import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { navigate } from 'wouter/use-browser-location'
import { AUTH0, AUTH_CONFIGURED } from './config'
import { ANONYMOUS, SessionContext } from './session'
import type { Session } from './session'
import { rolesFromToken, setAccessTokenProvider } from './token'

/** Where Auth0 should send the user after login: an in-app path, else the current page. */
function backTo(returnTo: unknown): string {
  return typeof returnTo === 'string' && returnTo.startsWith('/') ? returnTo : window.location.pathname + window.location.search
}

/** Exposes the Auth0 login as a Session, and hands the access token to the HTTP transport. */
function SessionBridge({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()
  const [tokenRoles, setTokenRoles] = useState<string[]>([])

  useEffect(() => {
    if (!isAuthenticated) {
      setAccessTokenProvider(null)
      return
    }
    setAccessTokenProvider(() => getAccessTokenSilently())
    let alive = true
    // The Post-Login Action puts roles in the access token (that's what the backend checks).
    getAccessTokenSilently()
      .then((token) => alive && setTokenRoles(token ? rolesFromToken(token, AUTH0.rolesClaim) : []))
      .catch(() => alive && setTokenRoles([]))
    return () => {
      alive = false
    }
  }, [isAuthenticated, getAccessTokenSilently])

  const session = useMemo<Session>(() => {
    const idRoles = user?.[AUTH0.rolesClaim]
    return {
      configured: true,
      ready: !isLoading,
      loggedIn: isAuthenticated,
      name: user?.name ?? user?.email ?? null,
      roles: !isAuthenticated ? [] : Array.isArray(idRoles) ? (idRoles as string[]) : tokenRoles,
      // Called directly as onClick handlers too, so anything but a string means "come back here".
      login: (returnTo?: unknown) => void loginWithRedirect({ appState: { returnTo: backTo(returnTo) } }),
      signup: (returnTo?: unknown) => void loginWithRedirect({ appState: { returnTo: backTo(returnTo) }, authorizationParams: { screen_hint: 'signup' } }),
      logout: () => void logout({ logoutParams: { returnTo: window.location.origin } }),
    }
  }, [isLoading, isAuthenticated, user, tokenRoles, loginWithRedirect, logout])

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

/**
 * Auth0 Universal Login for crew and supervisors. Off (everyone anonymous, nothing changes) in mock
 * mode and until VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID are set. Tokens live in localStorage with
 * refresh-token rotation, so a reload keeps the login without third-party cookies.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!AUTH_CONFIGURED) return <SessionContext.Provider value={ANONYMOUS}>{children}</SessionContext.Provider>
  return (
    <Auth0Provider
      domain={AUTH0.domain}
      clientId={AUTH0.clientId}
      authorizationParams={{ redirect_uri: window.location.origin, audience: AUTH0.audience }}
      cacheLocation="localstorage"
      useRefreshTokens
      useRefreshTokensFallback
      onRedirectCallback={(appState) => navigate(appState?.returnTo ?? '/', { replace: true })}
    >
      <SessionBridge>{children}</SessionBridge>
    </Auth0Provider>
  )
}
