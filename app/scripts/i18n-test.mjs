/* i18n unit checks: esbuild-bundles src/i18n (context + zh dictionary) and
 * verifies the dictionary against the source. English strings are the keys,
 * so the checks are: zh entries are non-empty and not accidentally identical
 * to their key (except allow-listed proper nouns), every t('...') key used
 * in src has a zh entry, and every zh entry corresponds to a string literal
 * that still exists somewhere in src (no dead dictionary entries). */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'

let failures = 0
let checks = 0
function check(ok, name, detail = '') {
  checks++
  if (!ok) { failures++; console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`) }
}

const out = '/tmp/cc-i18n-test'
mkdirSync(out, { recursive: true })
await build({
  entryPoints: ['src/i18n/zh.ts'],
  bundle: true,
  format: 'esm',
  outfile: `${out}/zh.mjs`,
})
const { ZH } = await import(pathToFileURL(`${out}/zh.mjs`).href)

/* 1. structural checks on the dictionary */
const PROPER = new Set(['Common Lisp', 'HyperSpec', 'ECL', 'SBCL', 'JSCL', 'IDE', 'Examples', 'Docs', 'buffer', ' Outline'])
for (const [k, v] of Object.entries(ZH)) {
  check(typeof v === 'string' && v.trim().length > 0, `zh entry non-empty: ${JSON.stringify(k)}`)
  check(v !== k || PROPER.has(k), `zh entry differs from key: ${JSON.stringify(k)}`)
}

/* collect all source text under src/ (ts/tsx) */
function walk(dir, acc) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(tsx?|css)$/.test(e)) acc.push(p)
  }
  return acc
}
const files = walk('src', []).filter((p) => !p.startsWith('src/i18n/'))
const sources = files.map((p) => readFileSync(p, 'utf8'))
const all = sources.join('\n')

/* 2. every literal t('...') / t("...") key has a zh entry */
const keyRe = /\bt\(\s*'((?:[^'\\]|\\.)*)'\s*[),]/g
const used = new Set()
for (const m of all.matchAll(keyRe)) used.add(m[1].replace(/\\'/g, "'"))
check(used.size > 50, 'a meaningful number of t() keys found', String(used.size))
const missing = [...used].filter((k) => !(k in ZH))
check(missing.length === 0, 'every t() key has a zh entry', `missing ${missing.length}: ${missing.slice(0, 5).join(' | ')}`)

/* 3. no dead entries: each zh key occurs as a literal somewhere in src
 * (either inside t('…') or as the label constant fed to t(variable)) */
const dead = Object.keys(ZH).filter((k) => !all.includes(JSON.stringify(k).slice(1, -1)) && !all.includes(k))
check(dead.length === 0, 'no dead zh entries', `unused: ${dead.slice(0, 5).join(' | ')}`)

console.log(failures === 0 ? `PASS: i18n (${checks} checks, ${Object.keys(ZH).length} zh entries, ${used.size} t() keys)` : `FAIL: i18n (${failures}/${checks})`)
process.exit(failures === 0 ? 0 : 1)
