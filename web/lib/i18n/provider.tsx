'use client'

import { createContext, useContext } from 'react'
import {
  DEFAULT_LANGUAGE,
  getDictionary,
  type Dictionary,
  type Language,
} from '@/lib/i18n'

interface LanguageContextValue {
  language: Language
  t: Dictionary
}

const VALUE: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  t: getDictionary(DEFAULT_LANGUAGE),
}

const LanguageContext = createContext<LanguageContextValue>(VALUE)

/**
 * Provides the (English) UI dictionary to the tree. The app is English-only,
 * so this is a static value — kept as a provider/hook pair so components can
 * keep reading copy through `useT()` / `useLanguage()` without churn.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  return <LanguageContext.Provider value={VALUE}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext)
}

/** Shortcut for components that only need the dictionary. */
export function useT(): Dictionary {
  return useLanguage().t
}
