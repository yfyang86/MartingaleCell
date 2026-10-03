/* i18n provider, Sprint 35: English is the source language and the key —
 * t('Run cell') returns the Chinese translation when the language is zh,
 * otherwise the key itself, so a missing entry degrades to English rather
 * than a broken placeholder. The context/hook live in context.ts. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, detectLang, makeT, type Lang, type Ctx } from './context'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)
  useEffect(() => {
    try { localStorage.setItem('martingalecell-lang', lang) } catch { /* private mode */ }
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])
  const value = useMemo<Ctx>(() => ({ lang, setLang: setLangState, t: makeT(lang) }), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
