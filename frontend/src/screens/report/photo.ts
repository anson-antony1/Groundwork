// Client-side photo prep for crew reports (README §7, §10 security minimum).
// 1. Accept only JPEG/PNG, checked by magic bytes (like the backend).
// 2. Re-encode on a canvas to a JPEG of at most 2048 px: big phone photos fit the 5 MB cap, and EXIF
//    metadata (including GPS position) is dropped; README §7 asks us not to collect crew positions.
// 3. Check the result again (JPEG, ≤ 5 MB) before it's sent.
import { MAX_PHOTO_BYTES, checkPhoto, readHead, sniffImage } from '../../domain/upload'

/** Originals above this are refused before decoding, to protect a phone's memory. */
const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024

export interface PreparedPhoto {
  blob: Blob
  previewUrl: string
  originalBytes: number
  width: number
  height: number
}

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot process photos.')
  ctx.fillStyle = '#ffffff' // PNG transparency becomes white, not black
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Could not encode the photo.')
  return { blob, width, height }
}

/** Throws an Error whose message is safe to show the crew. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const head = await readHead(file)
  const kind = sniffImage(head)
  if (kind !== 'jpeg' && kind !== 'png') {
    const check = checkPhoto(head, file.size)
    throw new Error(check.ok ? 'Photo must be a JPEG or PNG image.' : check.reason)
  }
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error('That photo is too large to process. Choose a smaller one.')

  // createImageBitmap applies the photo's EXIF orientation, so the upright image is what gets re-encoded.
  const bitmap = await createImageBitmap(file)
  try {
    let result = await encode(bitmap, 2048, 0.85)
    if (result.blob.size > MAX_PHOTO_BYTES) result = await encode(bitmap, 1600, 0.75)
    const check = checkPhoto(await readHead(result.blob), result.blob.size)
    if (!check.ok) throw new Error(check.reason)
    return { blob: result.blob, previewUrl: URL.createObjectURL(result.blob), originalBytes: file.size, width: result.width, height: result.height }
  } finally {
    bitmap.close()
  }
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
