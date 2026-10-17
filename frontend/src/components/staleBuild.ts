// Render replaces the whole build on every deploy, and every screen's file gets a new name. A tab opened
// before a deploy then can't load a screen it hasn't loaded yet: the old file is gone. Reloading fetches the
// new index.html and its files. At most once a minute per tab, so a file that is genuinely missing can't
// cause a reload loop; after that the error shows (ErrorBoundary).

const RELOADED_AT = 'gw.staleBuildReloadAt'
const MIN_GAP_MS = 60_000

/** The errors a failed dynamic import or preload produces, in Chrome, Firefox, Safari and Vite wording. */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|Failed to load module script|Unable to preload CSS/i.test(message)
}

/** Reloads the page unless this tab already did in the last minute. Returns true when it is reloading. */
export function reloadForNewBuild(now = Date.now(), reload = () => window.location.reload()): boolean {
  try {
    if (now - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < MIN_GAP_MS) return false
    sessionStorage.setItem(RELOADED_AT, String(now))
  } catch {
    return false // without storage there is no loop guard, so let the error show instead
  }
  reload()
  return true
}

/** A dynamic import that reloads the page, instead of failing, when the build changed under the tab. */
export function reloadingImport<T>(load: () => Promise<T>, onStale: () => boolean = reloadForNewBuild): () => Promise<T> {
  return () =>
    load().catch((error: unknown) => {
      // Never settles: the page is reloading, so Suspense keeps showing its loading state until then.
      if (isStaleBuildError(error) && onStale()) return new Promise<T>(() => {})
      throw error
    })
}
