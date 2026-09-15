/* The bundled cl-plot sample for the Node harnesses (Sprint 28).
 * Order: SAMPLE_PROJECT_DIR, the conventional /tmp/clplot extract, else the
 * zip under public/sample-projects read in memory with jszip (a project
 * dependency) — so CI exercises the sample without extracting anything.
 * Returns [{ path, content }] of the .lisp/.asd files, or null. */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const isSource = (name) => /\.(lisp|asd)$/i.test(name)

function fromDir(base) {
  try {
    const names = fs.readdirSync(base).filter(isSource)
    if (!names.length) return null
    return names.map((n) => ({ path: n, content: fs.readFileSync(path.join(base, n), 'utf8') }))
  } catch { return null }
}

async function fromZip(zipPath) {
  try {
    const require = createRequire(import.meta.url)
    const JSZip = require('jszip')
    const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
    const out = []
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir || !isSource(name)) continue
      out.push({ path: path.basename(name), content: await entry.async('string') })
    }
    return out.length ? out : null
  } catch { return null }
}

/** @returns {Promise<{ path: string, content: string }[] | null>} */
export async function loadSampleProject() {
  if (process.env.SAMPLE_PROJECT_DIR) return fromDir(process.env.SAMPLE_PROJECT_DIR)
  return fromDir('/tmp/clplot/cl-plot-master') ?? await fromZip(path.join(root, 'public', 'sample-projects', 'cl-plot.zip'))
}
