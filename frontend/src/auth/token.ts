// The bridge between the Auth0 session (React) and the HTTP transport (plain module), so api/http.ts
// can attach the logged-in user's access token without importing React or the Auth0 SDK.

type TokenProvider = () => Promise<string | undefined>

let provider: TokenProvider | null = null

export function setAccessTokenProvider(next: TokenProvider | null): void {
  provider = next
}

/** The logged-in user's API access token, or null when logged out or Auth0 can't be reached. Never throws. */
export async function accessToken(): Promise<string | null> {
  if (!provider) return null
  try {
    return (await provider()) ?? null
  } catch {
    return null
  }
}

/** Roles from an access token's payload (signature checks are the backend's job; this only shapes the UI). */
export function rolesFromToken(token: string, claim: string): string[] {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='))
    const roles = (JSON.parse(json) as Record<string, unknown>)[claim]
    return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}
