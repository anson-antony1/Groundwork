import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isStaleBuildError, reloadForNewBuild, reloadingImport } from './staleBuild'

beforeEach(() => sessionStorage.clear())

describe('isStaleBuildError', () => {
  it("recognizes each browser's failed dynamic import", () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x.onrender.com/assets/ReplayScreen-vnd6WPr0.js', // Chrome
      'error loading dynamically imported module: https://x.onrender.com/assets/a.js', // Firefox
      'Importing a module script failed.', // Safari
      'Unable to preload CSS for /assets/index-abc.css', // Vite
    ])
      expect(isStaleBuildError(new TypeError(message))).toBe(true)
  })

  it('leaves other errors alone', () => {
    expect(isStaleBuildError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isStaleBuildError(null)).toBe(false)
  })
})

describe('reloadForNewBuild', () => {
  it('reloads once, then not again for a minute, so a missing file cannot loop', () => {
    const reload = vi.fn()
    expect(reloadForNewBuild(1_000_000, reload)).toBe(true)
    expect(reloadForNewBuild(1_030_000, reload)).toBe(false)
    expect(reloadForNewBuild(1_061_000, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe('reloadingImport', () => {
  const stale = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/a.js'))

  it('passes a successful import through', async () => {
    await expect(reloadingImport(() => Promise.resolve('screen'))()).resolves.toBe('screen')
  })

  it('reloads instead of failing when the build changed, and never settles', async () => {
    const onStale = vi.fn(() => true)
    let settled = false
    void reloadingImport(stale, onStale)().finally(() => (settled = true))
    await new Promise((r) => setTimeout(r, 10))
    expect(onStale).toHaveBeenCalledOnce()
    expect(settled).toBe(false)
  })

  it('fails as usual when it already reloaded, or for any other error', async () => {
    await expect(reloadingImport(stale, () => false)()).rejects.toThrow('dynamically imported module')
    const onStale = vi.fn(() => true)
    await expect(reloadingImport(() => Promise.reject(new Error('boom')), onStale)()).rejects.toThrow('boom')
    expect(onStale).not.toHaveBeenCalled()
  })
})
