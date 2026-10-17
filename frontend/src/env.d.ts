/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "mock" serves the in-browser demo fixture; "live" calls the FastAPI backend. Defaults to mock. */
  readonly VITE_API_MODE?: 'mock' | 'live'
  /** Empty (default) = same origin, proxied by the dev server. Never put secrets in VITE_ variables. */
  readonly VITE_API_BASE_URL?: string
  /** "1" on the public Render build of the live app: shared-server notes (e.g. replay is global). */
  readonly VITE_HOSTED?: string
  /** "1" on the public mock-mode demo site: shows a visible launcher for the rehearsal controls. */
  readonly VITE_TRY_DOCK?: string
  /** Public URL of the live app, linked from /welcome on the demo site (no trailing slash). */
  readonly VITE_LIVE_URL?: string
  /** Public URL of the mock-mode demo site, linked from /welcome on the live app. */
  readonly VITE_DEMO_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
