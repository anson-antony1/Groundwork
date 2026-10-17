import { describe, expect, it } from 'vitest'
import { setAmbient } from './ambient'

describe('ambient motion switch (hotkey A)', () => {
  it('marks the page for the CSS and remembers the choice', () => {
    setAmbient(false)
    expect(document.documentElement.dataset.ambient).toBe('off')
    expect(localStorage.getItem('gw.ambient')).toBe('off')
    setAmbient(true)
    expect(document.documentElement.dataset.ambient).toBe('on')
    expect(localStorage.getItem('gw.ambient')).toBe('on')
  })
})
