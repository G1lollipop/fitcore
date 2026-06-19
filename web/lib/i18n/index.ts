import { en } from './dictionaries/en'
import { zh, type Dictionary } from './dictionaries/zh'
import type { Language } from './config'

export type { Dictionary } from './dictionaries/zh'
export type { Language } from './config'
export {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  HTML_LANG,
  isLanguage,
} from './config'

const DICTIONARIES: Record<Language, Dictionary> = { zh, en }

export function getDictionary(language: Language): Dictionary {
  return DICTIONARIES[language]
}

/**
 * Resolve an enum-style key (goal / level / category / difficulty) to its
 * localized label, falling back to the raw key when unmapped. Returns an
 * empty string for nullish keys so callers can use `&&` truthiness checks.
 */
export function tLabel(
  map: Record<string, string>,
  key: string | null | undefined
): string {
  if (!key) return ''
  return map[key] ?? key
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

/** True when the active dictionary is the English one. */
function isEnglish(t: Dictionary): boolean {
  return t.common.locale.startsWith('en')
}

/**
 * Pick the locale-appropriate display name for a DB-sourced exercise.
 * English UI prefers `name_en` (the seeded English label) and falls back to
 * the original `name` when it's missing (e.g. user-created exercises).
 */
export function localizedName(
  t: Dictionary,
  name: string,
  nameEn?: string | null
): string {
  if (isEnglish(t)) return nameEn?.trim() || name
  return name
}

/**
 * Map a raw muscle-group value (Chinese or English, free-form from the DB) to
 * a localized full label via keyword matching. Falls back to the raw value.
 */
export function muscleGroupLabel(t: Dictionary, value: string): string {
  if (!value) return ''
  const m = t.labels.muscles
  const lc = value.toLowerCase()
  if (lc.includes('chest') || value.includes('胸')) return m.chest
  if (lc.includes('back') || lc.includes('lat') || value.includes('背') || value.includes('阔'))
    return m.back
  if (lc.includes('glute') || value.includes('臀')) return m.glutes
  if (
    lc.includes('leg') ||
    lc.includes('quad') ||
    lc.includes('hamstring') ||
    lc.includes('calf') ||
    value.includes('腿') ||
    value.includes('股')
  )
    return m.legs
  if (lc.includes('shoulder') || lc.includes('delt') || value.includes('肩')) return m.shoulders
  if (
    lc.includes('arm') ||
    lc.includes('bicep') ||
    lc.includes('tricep') ||
    value.includes('臂') ||
    value.includes('二头') ||
    value.includes('三头')
  )
    return m.arms
  if (lc.includes('core') || lc.includes('abs') || value.includes('腹') || value.includes('核心'))
    return m.core
  if (lc.includes('cardio') || value.includes('有氧')) return m.cardio
  if (lc.includes('full') || value.includes('全身')) return m.fullBody
  return value
}

/**
 * Map a raw equipment value (Chinese or English, free-form from the DB) to a
 * localized label via keyword matching. Falls back to the raw value.
 */
export function equipmentLabel(t: Dictionary, value: string): string {
  if (!value) return ''
  const e = t.labels.equipment
  const lc = value.toLowerCase()
  if (lc.includes('barbell') || value.includes('杠铃')) return e.barbell
  if (lc.includes('dumbbell') || value.includes('哑铃')) return e.dumbbell
  if (lc.includes('smith') || value.includes('史密斯')) return e.smith
  if (lc.includes('cable') || value.includes('绳索') || value.includes('拉索')) return e.cable
  if (lc.includes('kettlebell') || value.includes('壶铃')) return e.kettlebell
  if (lc.includes('band') || value.includes('弹力带') || value.includes('阻力带')) return e.band
  if (lc.includes('ball') || value.includes('健身球') || value.includes('瑞士球')) return e.ball
  if (
    lc.includes('bodyweight') ||
    lc.includes('body weight') ||
    value.includes('自重') ||
    value.includes('徒手')
  )
    return e.bodyweight
  if (lc.includes('machine') || value.includes('器械') || value.includes('机械')) return e.machine
  if (lc.includes('none') || lc.includes('other') || value.includes('其他') || value.includes('无'))
    return e.other
  return value
}
