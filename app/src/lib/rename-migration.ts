/* 1.0.0-beta.4: ConsCell → MartingaleCell renamed every persisted key from
 * conscell-* to martingalecell-*. This module carries existing users' state
 * across the rename, in two parts:
 *
 *  - localStorage (engine preference, memory quota, language, search
 *    options, session transcripts): copied synchronously on first import.
 *  - IndexedDB via idb-keyval (workspace, editor states, project
 *    definitions, virtual project, directory handle, installed modules):
 *    copied by `migrateStorage()`, which `main.tsx` awaits before the first
 *    render so the stores hydrate from the migrated keys.
 *
 * Both are idempotent: a key is copied only when the new one is absent, and
 * only conscell-* keys are read. Old keys are left in place. */
import { get as idbGet, set as idbSet } from 'idb-keyval'

const OLD = 'conscell-'
const NEW = 'martingalecell-'

/** The idb-keyval keys the rename touched (suffix after the prefix). */
export const IDB_SUFFIXES = [
  'workspace-v1',
  'editor-states-v1',
  'definitions-v1',
  'virtual-project-v1',
  'dir-handle',
  'modules-v1',
] as const

export function migrateLocalStorage(storage: Storage = localStorage): number {
  let copied = 0
  try {
    const stale: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && k.startsWith(OLD)) stale.push(k)
    }
    for (const k of stale) {
      const target = NEW + k.slice(OLD.length)
      if (storage.getItem(target) === null) {
        storage.setItem(target, storage.getItem(k) ?? '')
        copied++
      }
    }
  } catch { /* private mode — nothing persisted anyway */ }
  return copied
}

export type IdbLike = {
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
}

/** Copy each renamed IndexedDB key when the new one is still unset. Resolves
 * to the number of keys copied; never rejects (a missing or blocked
 * IndexedDB just means nothing to migrate). */
export async function migrateIndexedDb(idb: IdbLike = { get: idbGet, set: idbSet }): Promise<number> {
  let copied = 0
  for (const suffix of IDB_SUFFIXES) {
    try {
      const fresh = await idb.get(NEW + suffix)
      if (fresh !== undefined) continue
      const old = await idb.get(OLD + suffix)
      if (old === undefined) continue
      await idb.set(NEW + suffix, old)
      copied++
    } catch { /* no IndexedDB (private mode, sandboxed iframe) — skip */ }
  }
  return copied
}

/** Everything the rename needs, in order. Safe to call more than once. */
export async function migrateStorage(idb?: IdbLike): Promise<{ local: number; idb: number }> {
  const local = migrateLocalStorage()
  const idbCount = await migrateIndexedDb(idb)
  return { local, idb: idbCount }
}

/* First import: localStorage right away (synchronous consumers read it at
 * module-evaluation time, e.g. the engine preference). */
if (typeof localStorage !== 'undefined') migrateLocalStorage()
