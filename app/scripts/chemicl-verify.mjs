/* Boots the real SBCL worker and loads the chemicl port as a project
 * (same protocol as sbcl-test.mjs), then asserts the caffeine demo.
 * Usage: node --experimental-wasm-exnref scripts/chemicl-verify.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const require = createRequire(import.meta.url)
const JSZip = require('jszip')
await build({ entryPoints: ['src/plot/gnuplot.ts'], bundle: true, format: 'esm', outfile: '/tmp/chem-plot.mjs' })
const { parsePlotMarker } = await import(pathToFileURL('/tmp/chem-plot.mjs').href)
const zip = await JSZip.loadAsync(fs.readFileSync(path.join(publicDir, 'sample-projects', 'chemicl.zip')))
const files = []
for (const [name, entry] of Object.entries(zip.files)) {
  if (entry.dir || !/\.(lisp|asd)$/i.test(name)) continue
  files.push({ path: path.basename(name), content: await entry.async('string') })
}
if (!files.length) { console.log('FAIL: chemicl.zip empty'); process.exit(1) }

const MAILBOX_OFF = 8192
const enc = new TextEncoder()
let sab, i32, u8, worker, done = false
const msgs = []
const out = (id) => msgs.filter((m) => (m.type === 'stdout' || m.type === 'stderr') && m.id === id).map((m) => m.text)

function finish(ok, why) {
  if (done) return
  done = true
  console.log(ok ? `\nPASS: ${why}` : `\nFAIL: ${why}`)
  if (worker) worker.terminate()
  process.exit(ok ? 0 : 1)
}
setTimeout(() => finish(false, 'timeout 300s'), 300_000)

function submit(msg) {
  const bytes = enc.encode(JSON.stringify(msg))
  u8.set(bytes, MAILBOX_OFF)
  u8[MAILBOX_OFF + bytes.length] = 0
  Atomics.store(i32, 4, 1)
  Atomics.notify(i32, 4)
}

const workerSrc = fs.readFileSync(path.join(publicDir, 'sbcl-worker.js'), 'utf8')
const prelude = `
const { parentPort } = require('node:worker_threads')
const nodeFs = require('node:fs')
const nodePath = require('node:path')
const nodeZlib = require('node:zlib')
const self = { postMessage: (m) => parentPort.postMessage(m), onmessage: null,
  __ccSbclLoadBytes: (p) => { const f = nodePath.join(${JSON.stringify(path.join(publicDir, 'sbcl'))}, nodePath.basename(p)); return nodeFs.existsSync(f) ? nodeFs.readFileSync(f) : nodeZlib.gunzipSync(nodeFs.readFileSync(f + '.gz')) } }
globalThis.self = self
`

if (!process.execArgv.includes('--experimental-wasm-exnref') && !process.env.CC_NO_RE) {
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath, ['--experimental-wasm-exnref', fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, CC_NO_RE: '1' } })
  child.on('exit', (code) => process.exit(code ?? 0))
} else {
  worker = new Worker(prelude + workerSrc, { eval: true, stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 8192, stackSizeMb: 512 } })
  worker.on('message', (m) => {
    msgs.push(m)
    if (m.type === 'sbcl-sab') { sab = m.sab; i32 = new Int32Array(sab); u8 = new Uint8Array(sab) }
    if (m.type === 'bootfail') finish(false, 'bootfail: ' + m.message)
    if (m.type === 'ready') submit({ type: 'load-project', id: 200, files })
    if (m.type === 'done' && m.id === 200) {
      const lines = out(200)
      const bad = lines.filter((l) => /;;ERROR:|;;ERRTYPE:/.test(l))
      if (bad.length) {
        for (const l of lines) console.log('L: ' + l)
        return finish(false, 'load errors: ' + bad.length)
      }
      submit({ type: 'eval', id: 201, code: `
(list
  (chemicl:molecular-formula *caffeine*) (chemicl:mass *caffeine*)
  ;; SMILES: parse straight from the string (aspirin), round-trip benzene
  (chemicl:molecular-formula (chemicl:parse-smiles-string "CC(=O)Oc1ccccc1C(=O)O"))
  (chemicl:mass (chemicl:parse-smiles-string "CC(=O)Oc1ccccc1C(=O)O"))
  (chemicl:molecular-formula (chemicl:parse-smiles-string "CCO"))
  (chemicl:write-smiles-string (chemicl:parse-smiles-string "c1ccccc1"))
  (chemicl:molecular-formula (chemicl:parse-smiles-string
    (chemicl:write-smiles-string (chemicl:parse-smiles-string "c1ccccc1"))))
  ;; show-smiles draws the molecule — a raw-SVG ;;PLOT64 marker
  (chemicl:molecular-formula
    (chemicl:show-smiles "Cn1cnc2c1c(=O)n(C)c(=O)n2C" :name "caffeine")))` })
    }
    if (m.type === 'done' && m.id === 201) {
      const l = out(201).join('\n')
      const checks = [
        ['caffeine formula', l.includes('C8H10N4O2')],
        ['caffeine mass', /194\.19/.test(l)],
        ['SMILES aspirin formula', l.includes('C9H8O4')],
        ['SMILES aspirin mass', /180\.15/.test(l)],
        ['SMILES ethanol formula', l.includes('C2H6O1')],
        ['SMILES benzene write', /1c|c1|cH|C1/.test(l)],
        ['SMILES benzene round-trip', (l.match(/C6H6/g) || []).length >= 1],
      ]
      /* the show-smiles PLOT64 marker must arrive AND parse as raw svg */
      const marker = out(201).find((l) => l.startsWith(';;PLOT64'))
      let att = null
      try { att = marker ? parsePlotMarker(marker) : null } catch { att = null }
      checks.push(['show-smiles marker arrives', !!marker])
      checks.push(['marker parses as raw SVG', !!(att && att.svg && att.svg.startsWith('<svg') && att.svg.includes('<circle'))])
      checks.forEach(([n, ok]) => { if (!ok) console.log('  ✗ ' + n) })
      console.log('result lines:', l.split('\n').filter(Boolean).slice(0, 8))
      const ok = checks.every(([, ok]) => ok)
      finish(ok, `chemicl on SBCL/wasm — ${checks.filter(([, ok]) => ok).length}/${checks.length} checks`)
    }
  })
  worker.on('error', (e) => finish(false, 'worker error: ' + (e?.stack || e)))
}
