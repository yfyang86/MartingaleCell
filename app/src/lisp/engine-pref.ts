/* The engine preference (Settings → Lisp implementation), Sprint 27.
 * 'auto'  — ECL first, then JSCL, then the mock (the original ladder)
 * 'ecl'   — ECL only: a failure stays a failure (Retry on the boot screen)
 * 'sbcl'  — SBCL, then ECL when the artifacts are missing or the boot fails
 * The value lives in the workspace settings (persisted, reset with the
 * workspace) and is mirrored here in localStorage so the runtime can read
 * it synchronously before the store has hydrated. */
export type EnginePref = 'auto' | 'ecl' | 'sbcl'

const ENGINE_PREF_KEY = 'conscell-engine-pref'

export function getEnginePref(): EnginePref {
  try {
    const v = localStorage.getItem(ENGINE_PREF_KEY)
    return v === 'sbcl' || v === 'ecl' ? v : 'auto'
  } catch { return 'auto' }
}

export function setEnginePref(p: EnginePref) {
  try { localStorage.setItem(ENGINE_PREF_KEY, p) } catch { /* private mode */ }
}
