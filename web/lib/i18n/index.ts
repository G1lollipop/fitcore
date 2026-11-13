import { en, type Dictionary } from './dictionaries/en'
import type { Language } from './config'

export type { Dictionary } from './dictionaries/en'
export type { Language } from './config'
export { LANGUAGES, DEFAULT_LANGUAGE, HTML_LANG, isLanguage } from './config'

const DICTIONARIES: Record<Language, Dictionary> = { en }

export function getDictionary(language: Language): Dictionary {
  return DICTIONARIES[language]
}

/**
 * Resolve a server-action error code to a localized message. Unknown values
 * (e.g. raw technical DB errors) pass through unchanged so nothing is hidden.
 */
export function tError(
  t: Dictionary,
  code: string | null | undefined
): string {
  if (!code) return ''
  return (t.errors as Record<string, string>)[code] ?? code
}
