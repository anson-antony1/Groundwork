import { API_MODE } from '../api/config'

const env = import.meta.env

/**
 * Auth0 settings for the login. The audience and roles claim must match the backend exactly
 * (backend/app/config.py AUTH0_AUDIENCE, AUTH0_ROLES_CLAIM): "https://groundwork-api", no trailing slash.
 * None of this is secret: a single-page app's domain and client ID are public by design.
 */
export const AUTH0 = {
  domain: (env.VITE_AUTH0_DOMAIN ?? '').trim(),
  clientId: (env.VITE_AUTH0_CLIENT_ID ?? '').trim(),
  audience: (env.VITE_AUTH0_AUDIENCE ?? '').trim() || 'https://groundwork-api',
  rolesClaim: (env.VITE_AUTH0_ROLES_CLAIM ?? '').trim() || 'https://groundwork-api/roles',
}

/** Login exists only against the real backend, and only once the Auth0 app's domain and client ID are set. */
export const AUTH_CONFIGURED = API_MODE === 'live' && AUTH0.domain !== '' && AUTH0.clientId !== ''
