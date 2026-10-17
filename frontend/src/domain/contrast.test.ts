import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

// Reads the real tokens from theme.css so the test can't drift from what ships.
// (Read from disk: Vitest stubs CSS imports, even ?raw, as empty strings.)
const css = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8')
const tokens = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]))
const color = (name: string) => {
  const value = tokens[name]
  if (!value) throw new Error(`missing --color-${name} in theme.css`)
  return value
}

const SURFACES = ['bg', 'panel', 'steel']

describe('theme contrast (WCAG AA)', () => {
  it.each(['ink', 'muted', 'faint', 'accent', 'go', 'caution', 'nogo-text', 'stop-glow', 'unknown'])(
    'text color %s is readable on every surface',
    (text) => {
      for (const surface of SURFACES) expect(contrastRatio(color(text), color(surface))).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each([
    ['go-ink', 'go'],
    ['caution-ink', 'caution'],
    ['nogo-ink', 'nogo'],
    ['stop-ink', 'stop'],
    ['unknown-ink', 'unknown'],
    ['accent-ink', 'accent'],
  ])('placard text %s on %s fill', (text, fill) => {
    expect(contrastRatio(color(text), color(fill))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['go', 'caution', 'nogo', 'stop', 'unknown'])('status fill %s stands out from the background', (fill) => {
    for (const surface of SURFACES) expect(contrastRatio(color(fill), color(surface))).toBeGreaterThanOrEqual(3)
  })

  it.each(['lcd-green', 'lcd-amber', 'lcd-red', 'lcd-white'])('LCD text is crisp on the %s backlight', (backlight) => {
    expect(contrastRatio(color('lcd-ink'), color(backlight))).toBeGreaterThanOrEqual(7)
  })
})
