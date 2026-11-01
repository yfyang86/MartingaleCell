/* i18n context and hook live here (not next to the provider component) so
 * react-refresh can fast-reload components cleanly. English is the source
 * language and the key — see index.tsx. */
import { createContext, useContext } from 'react'
import { ZH } from './zh'

export type Lang = 'en' | 'zh'

const LANG_KEY = 'martingalecell-lang'

export function detectLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v === 'en' || v === 'zh') return v
  } catch { /* private mode */ }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string }

export const I18nContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (s) => s })

export function makeT(lang: Lang) {
  return (s: string) => (lang === 'zh' ? ZH[s] ?? s : s)
}

export function useI18n() {
  return useContext(I18nContext)
}
