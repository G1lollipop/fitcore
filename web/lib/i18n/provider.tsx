'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  DEFAULT_LANGUAGE,
  HTML_LANG,
  LANGUAGE_STORAGE_KEY,
  getDictionary,
  isLanguage,
  type Dictionary,
  type Language,
} from '@/lib/i18n'

interface LanguageContextValue {
  language: Language
  /** True once the persisted preference has been read on the client. */
  mounted: boolean
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  t: Dictionary
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

/**
 * Holds the active UI language and exposes the matching dictionary.
 *
 * Preference is persisted to `localStorage` (the user's choice — no backend).
 * Because localStorage is client-only, the server renders with
 * `DEFAULT_LANGUAGE`; on mount we read the stored value and, if different,
 * re-render once. The `<html lang>` attribute and `document.title` are synced
 * client-side whenever the language changes.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE)
  const [mounted, setMounted] = useState(false)

  // Read the persisted preference once, after hydration.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      if (isLanguage(stored)) {
        setLanguageState(stored)
      }
    } catch {
      // localStorage may be unavailable (private mode etc.) — ignore.
    }
    setMounted(true)
  }, [])

  // Keep <html lang> + document.title in sync with the active language.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = HTML_LANG[language]
    document.title = getDictionary(language).metadata.title
  }, [language])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    } catch {
      // ignore persistence failures
    }
  }, [])

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'zh' ? 'en' : 'zh')
  }, [language, setLanguage])

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      mounted,
      setLanguage,
      toggleLanguage,
      t: getDictionary(language),
    }),
    [language, mounted, setLanguage, toggleLanguage]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useLanguage must be used within a <LanguageProvider>')
  }
  return ctx
}

/** Shortcut for components that only need the dictionary. */
export function useT(): Dictionary {
  return useLanguage().t
}
