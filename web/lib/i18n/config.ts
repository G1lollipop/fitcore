export const LANGUAGES = ['zh', 'en'] as const

export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'zh'

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
