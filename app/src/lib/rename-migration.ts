/* 1.0.0-beta.4: ConsCell → MartingaleCell renamed every localStorage key
 * from conscell-* to martingalecell-*. This one-shot, first-import copy
 * carries existing users' state across the rename (engine preference,
 * memory quota, editor states, workspace, session transcripts). Idempotent:
 * only copies when the new key is absent, and only touches conscell- keys. */
const OLD = 'conscell-'
const NEW = 'martingalecell-'

try {
  const stale: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(OLD)) stale.push(k)
  }
  for (const k of stale) {
    const target = NEW + k.slice(OLD.length)
    if (localStorage.getItem(target) === null) localStorage.setItem(target, localStorage.getItem(k) ?? '')
  }
} catch { /* private mode — nothing persisted anyway */ }
