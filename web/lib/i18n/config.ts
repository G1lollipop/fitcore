export const LANGUAGES = ['zh', 'en'] as const

export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'en'

/** localStorage key holding the user's language preference. */
export const LANGUAGE_STORAGE_KEY = 'fitcore-lang'

/** Maps a `Language` to the value used on the `<html lang>` attribute. */
export const HTML_LANG: Record<Language, string> = {
  zh: 'zh-CN',
  en: 'en',
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/**
 * Best-effort guess of the visitor's preferred language from the browser.
 * Anything that looks like Chinese (`zh`, `zh-CN`, `zh-TW`, …) maps to `zh`;
 * every other locale falls back to English so non-Chinese speakers get a
 * readable UI on first visit. Safe to call on the server (returns the default).
 */
export function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE
  const candidates = navigator.languages?.length
    ? navigator.languages
    : [navigator.language]
  for (const tag of candidates) {
    if (!tag) continue
    const lc = tag.toLowerCase()
    if (lc.startsWith('zh')) return 'zh'
    if (lc.startsWith('en')) return 'en'
  }
  return 'en'
}
