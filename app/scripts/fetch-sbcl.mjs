/* Copy the SBCL WebAssembly port's artifacts from a local sbcl checkout
 * (branch wasm-dev) into public/sbcl/, where the dev server and builds
 * pick them up. They are large (~112 MB) and gitignored — run this after
 * building or pulling the sbcl repo.
 *
 *   node scripts/fetch-sbcl.mjs [sbcl-checkout-dir]
 *
 * Default checkout dir: ~/Git/sbcl. Expects src/runtime/sbcl.wasm,
 * output/sbcl.core and output/sbcl-core.wasm (see SBCL-Handoff.md §2).
 * With --check, only verifies presence and exits.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.join(root, 'public', 'sbcl')
const src = process.argv.slice(2).find((a) => !a.startsWith('-'))
  || path.join(process.env.HOME ?? '', 'Git', 'sbcl')
const checkOnly = process.argv.includes('--check')

const files = [
  ['src/runtime/sbcl.wasm', 'the C runtime'],
  ['output/sbcl.core', 'the heap image'],
  ['output/sbcl-core.wasm', 'the Lisp module'],
]

const missing = files.filter(([rel]) => !fs.existsSync(path.join(src, rel)))
if (missing.length > 0) {
  console.error(`sbcl checkout at ${src} is missing build artifacts:`)
  missing.forEach(([rel]) => console.error(`  ${rel}`))
  console.error('Build them first:  ./build-wasm-darwin-arm64.sh   (see WASM-Manual.md §3)')
  process.exit(1)
}
if (checkOnly) {
  files.forEach(([rel]) => {
    const p = path.join(src, rel)
    console.log(`${rel}  ${(fs.statSync(p).size / 1e6).toFixed(1)} MB`)
  })
  console.log('fetch-sbcl: artifacts present')
  process.exit(0)
}

fs.mkdirSync(dest, { recursive: true })
files.forEach(([rel]) => {
  const from = path.join(src, rel)
  const to = path.join(dest, path.basename(rel))
  fs.copyFileSync(from, to)
  console.log(`${rel} -> public/sbcl/${path.basename(rel)}  ${(fs.statSync(from).size / 1e6).toFixed(1)} MB`)
})
console.log('fetch-sbcl: done — the SBCL engine can now boot (Settings → Lisp implementation → sbcl)')
