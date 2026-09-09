/* ZIP import/export for virtual projects (jszip). */

import JSZip from 'jszip'
import { isTextish } from './tree'

const MAX_FILE_BYTES = 2 * 1024 * 1024

/** Unpack a zip into a flat { path: content } map (text-ish files only).
 * A single shared top-level directory (e.g. "cl-plot-master/") is stripped. */
export async function zipToVirtual(data: Blob | ArrayBuffer): Promise<{ files: Record<string, string>; skipped: number }> {
  const zip = await JSZip.loadAsync(data)
  const files: Record<string, string> = {}
  let skipped = 0
  const entries = Object.values(zip.files).filter((f) => !f.dir)
  /* common root prefix detection */
  const firstSegments = new Set(entries.map((f) => f.name.split('/')[0]))
  const prefix = firstSegments.size === 1 && entries.every((f) => f.name.includes('/'))
    ? [...firstSegments][0] + '/'
    : ''
  for (const entry of entries) {
    const path = (prefix ? entry.name.slice(prefix.length) : entry.name).replace(/^\/+/, '')
    if (!path || path.split('/').some((seg) => seg === '.git' || seg === 'node_modules')) continue
    const base = path.split('/').pop() ?? path
    if (!isTextish(base)) { skipped++; continue }
    const blob = await entry.async('uint8array')
    if (blob.byteLength > MAX_FILE_BYTES) { skipped++; continue }
    files[path] = new TextDecoder('utf-8', { fatal: false }).decode(blob)
  }
  return { files, skipped }
}

/** Generate a zip from path/content pairs and trigger a browser download. */
export async function downloadZip(name: string, files: { path: string; content: string }[]): Promise<void> {
  const zip = new JSZip()
  for (const f of files) zip.file(f.path, f.content)
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name.endsWith('.zip') ? name : `${name}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
