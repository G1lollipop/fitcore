export const LANGUAGES = ['en'] as const

export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'en'

/** Maps a `Language` to the value used on the `<html lang>` attribute. */
export const HTML_LANG: Record<Language, string> = {
  en: 'en',
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}
