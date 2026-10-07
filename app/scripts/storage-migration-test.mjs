/* Unit test of the rename migration (src/lib/rename-migration.ts): the
 * IndexedDB keys renamed from conscell-* to martingalecell-* are copied
 * when the new key is absent, kept when present, and a throwing store is
 * survived. Exit 0 = pass.
 *
 *   node scripts/storage-migration-test.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entry = path.join(os.tmpdir(), `martingalecell-migration-entry-${process.pid}.ts`)
const outfile = path.join(os.tmpdir(), `martingalecell-migration-bundle-${process.pid}.mjs`)
fs.writeFileSync(entry, `export { migrateIndexedDb, migrateLocalStorage, IDB_SUFFIXES } from ${JSON.stringify(path.join(root, 'src/lib/rename-migration'))}\n`)
/* idb-keyval touches indexedDB at call time only; stub it so the bundle
 * never needs a browser. */
esbuild.buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' })
const mod = await import(outfile)

let fails = 0
const check = (ok, label) => { console.log((ok ? '✓ ' : '✗ ') + label); if (!ok) fails++ }

const fakeIdb = (seed) => {
  const store = new Map(Object.entries(seed))
  return {
    store,
    get: async (k) => store.get(k),
    set: async (k, v) => { store.set(k, v) },
  }
}

/* ---- idb: copies every renamed key when the new one is absent ---- */
{
  const idb = fakeIdb({
    'conscell-workspace-v1': { cells: [{ input: '(+ 1 2)' }] },
    'conscell-editor-states-v1': { 'a.lisp': { scroll: 3 } },
    'conscell-definitions-v1': [{ name: 'f' }],
    'conscell-virtual-project-v1': { files: {} },
    'conscell-dir-handle': { kind: 'directory' },
    'conscell-modules-v1': ['cl-ppcre'],
  })
  const n = await mod.migrateIndexedDb(idb)
  check(n === 6, `all six idb keys copied (got ${n})`)
  check(idb.store.get('martingalecell-workspace-v1')?.cells?.[0]?.input === '(+ 1 2)', 'workspace copied intact')
  check(Array.isArray(idb.store.get('martingalecell-modules-v1')), 'installed modules copied')
  check(idb.store.has('conscell-workspace-v1'), 'old keys left in place')
  check(mod.IDB_SUFFIXES.length === 6, 'six idb suffixes listed')
}

/* ---- idb: a present new key wins ---- */
{
  const idb = fakeIdb({ 'conscell-workspace-v1': { cells: ['old'] }, 'martingalecell-workspace-v1': { cells: ['new'] } })
  const n = await mod.migrateIndexedDb(idb)
  check(n === 0, 'nothing copied over an existing new key')
  check(idb.store.get('martingalecell-workspace-v1').cells[0] === 'new', 'new value kept')
}

/* ---- idb: fresh profile, idempotent second run ---- */
{
  const idb = fakeIdb({})
  check((await mod.migrateIndexedDb(idb)) === 0 && idb.store.size === 0, 'fresh profile: no keys written')
  const seeded = fakeIdb({ 'conscell-modules-v1': ['x'] })
  await mod.migrateIndexedDb(seeded)
  check((await mod.migrateIndexedDb(seeded)) === 0, 'second run copies nothing')
}

/* ---- idb: a throwing store never rejects ---- */
{
  const idb = { get: async () => { throw new Error('InvalidStateError') }, set: async () => {} }
  let ok = true
  try { await mod.migrateIndexedDb(idb) } catch { ok = false }
  check(ok, 'throwing IndexedDB is survived')
}

/* ---- localStorage ---- */
{
  const m = new Map([['conscell-engine-pref', 'sbcl'], ['conscell-lang', 'zh'], ['martingalecell-lang', 'en'], ['other', '1']])
  const storage = {
    get length() { return m.size },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, v) },
  }
  const n = mod.migrateLocalStorage(storage)
  check(n === 1, `one localStorage key copied (got ${n})`)
  check(m.get('martingalecell-engine-pref') === 'sbcl', 'engine preference copied')
  check(m.get('martingalecell-lang') === 'en', 'existing new localStorage key kept')
  check(!m.has('martingalecell-other'), 'unrelated keys untouched')
}

fs.rmSync(entry, { force: true }); fs.rmSync(outfile, { force: true })
console.log(fails ? `\nFAIL: ${fails} check(s)` : '\nPASS: storage migration')
process.exit(fails ? 1 : 0)
