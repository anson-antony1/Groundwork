/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "mock" serves the in-browser demo fixture; "live" calls the FastAPI backend. Defaults to mock. */
  readonly VITE_API_MODE?: 'mock' | 'live'
  /** Empty (default) = same origin, proxied by the dev server. Never put secrets in VITE_ variables. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
