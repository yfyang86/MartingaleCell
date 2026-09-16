/* The engine preference (Settings → Lisp implementation), Sprint 27.
 * Since 1.0 SBCL (public domain with MIT/BSD-style parts) is the core engine and the default:
 * 'auto'  — SBCL first (the default); ECL when the artifacts are missing
 *           or the boot fails, then JSCL, then the mock
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

/* The SBCL memory quota: a total linear-memory ceiling in MB, or 'off'
 * (the default — no cap). A ceiling fits embedded browsers (an Electron
 * guest view can be OOM-killed by the unbounded image); the image
 * resident floor is ~230 MB, so 512 leaves real session room. Takes
 * effect on the next SBCL boot. */
export type SbclMemory = 'off' | 512 | 768

const SBCL_MEM_KEY = 'conscell-sbcl-mem'

export function getSbclMemory(): SbclMemory {
  try {
    const v = localStorage.getItem(SBCL_MEM_KEY)
    return v === '512' || v === '768' ? (Number(v) as SbclMemory) : 'off'
  } catch { return 'off' }
}

export function setSbclMemory(mem: SbclMemory) {
  try { localStorage.setItem(SBCL_MEM_KEY, String(mem)) } catch { /* private mode */ }
}
