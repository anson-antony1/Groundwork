import { afterEach, describe, expect, it, vi } from 'vitest'
import { viewTransitionNav } from './viewTransitionNav'

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition')
})

describe('viewTransitionNav', () => {
  it('navigates plainly where the View Transitions API is missing', () => {
    const navigate = vi.fn()
    viewTransitionNav(navigate, '/sites/SITE-001', { transition: true })
    expect(navigate).toHaveBeenCalledWith('/sites/SITE-001', { transition: true })
  })

  it('runs a link marked `transition` inside a view transition', () => {
    const navigate = vi.fn()
    const start = vi.fn((update: () => void) => update())
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true })
    viewTransitionNav(navigate, '/sites/SITE-001', { transition: true })
    expect(start).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledOnce()
  })

  it('leaves ordinary links alone', () => {
    const navigate = vi.fn()
    const start = vi.fn()
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true })
    viewTransitionNav(navigate, '/replay')
    expect(start).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/replay', undefined)
  })
})
