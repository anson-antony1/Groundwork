import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_BYTES, checkPhoto, readHead, sniffImage } from './upload'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])
const HEIC = new Uint8Array([0, 0, 0, 0x18, ...'ftypheic'].map((c) => (typeof c === 'string' ? c.charCodeAt(0) : c)))
const GIF = new Uint8Array([...'GIF89a'].map((c) => c.charCodeAt(0)))

describe('photo validation (JPEG/PNG, ≤ 5 MB)', () => {
  it('identifies images by magic bytes, not names', () => {
    expect(sniffImage(JPEG)).toBe('jpeg')
    expect(sniffImage(PNG)).toBe('png')
    expect(sniffImage(HEIC)).toBe('heic')
    expect(sniffImage(GIF)).toBe('other')
    expect(sniffImage(new Uint8Array([]))).toBe('other')
  })

  it('accepts JPEG and PNG up to exactly 5 MB', () => {
    expect(checkPhoto(JPEG, MAX_PHOTO_BYTES)).toEqual({ ok: true, kind: 'jpeg' })
    expect(checkPhoto(PNG, 1024)).toEqual({ ok: true, kind: 'png' })
  })

  it('rejects anything over 5 MB', () => {
    const result = checkPhoto(JPEG, MAX_PHOTO_BYTES + 1)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/limit is 5 MB/)
  })

  it('rejects HEIC with a fix the crew can follow', () => {
    const result = checkPhoto(HEIC, 2048)
    expect(!result.ok && result.reason).toMatch(/Most Compatible/)
  })

  it('rejects other formats and empty files', () => {
    expect(checkPhoto(GIF, 2048).ok).toBe(false)
    expect(checkPhoto(JPEG, 0).ok).toBe(false)
  })

  it('reads the head of a blob', async () => {
    const head = await readHead(new Blob([PNG, new Uint8Array(100)]))
    expect(sniffImage(head)).toBe('png')
  })
})
