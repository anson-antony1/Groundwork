// Photo checks before upload (README §10 security minimum): JPEG or PNG only, at most 5 MB.
// Like the backend (services/reports.py), the type comes from the file's magic bytes, not its name.

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export type ImageKind = 'jpeg' | 'png' | 'heic' | 'other'

/** Identifies an image from its first bytes (12 are enough). */
export function sniffImage(bytes: Uint8Array): ImageKind {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'png'
  // ISO-BMFF "ftyp" box with an HEIF brand: iPhone camera photos when "High Efficiency" is on.
  const ascii = String.fromCharCode(...bytes.slice(4, 12))
  if (/^ftyp(heic|heix|hevc|mif1|msf1)/.test(ascii)) return 'heic'
  return 'other'
}

export type PhotoCheck = { ok: true; kind: 'jpeg' | 'png' } | { ok: false; reason: string }

/** Checks bytes and size. `size` is the file size in bytes. */
export function checkPhoto(head: Uint8Array, size: number): PhotoCheck {
  const kind = sniffImage(head)
  if (kind === 'heic') {
    return { ok: false, reason: 'This photo is HEIC. Choose JPEG/PNG (iPhone: Settings › Camera › Formats › Most Compatible).' }
  }
  if (kind !== 'jpeg' && kind !== 'png') return { ok: false, reason: 'Photo must be a JPEG or PNG image.' }
  if (size > MAX_PHOTO_BYTES) return { ok: false, reason: `Photo is ${(size / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB.` }
  if (size === 0) return { ok: false, reason: 'Photo file is empty.' }
  return { ok: true, kind }
}

/** Reads the first bytes of a file/blob for sniffing. */
export async function readHead(blob: Blob, length = 12): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(0, length).arrayBuffer())
}
