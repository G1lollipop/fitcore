/**
 * Macro / calorie aggregation used by the nutrition center.
 *
 * Mirrors the inline reductions previously scattered through
 * `components/nutrition-center.tsx` and `components/stats-cards.tsx`.
 * Pure, memoizable, easy to unit-test.
 */

export interface DietLogLike {
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fat?: number | null
}

export interface MacroTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface MacroGoals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface MacroProgress {
  current: number
  target: number
  /** 0..100, clamped. 0 if `target` <= 0. */
  pct: number
  /** Raw delta (current - target). Negative = under, positive = over. */
  delta: number
  status: 'under' | 'on-track' | 'over'
}

const ON_TRACK_BAND = 0.05 // ±5% counts as "on-track"

/** Sum a list of diet logs into total macros. Missing fields treated as 0. */
export function sumMacros(logs: DietLogLike[]): MacroTotals {
  return logs.reduce<MacroTotals>(
    (acc, log) => ({
      calories: acc.calories + (log.calories ?? 0),
      protein: acc.protein + (log.protein ?? 0),
      carbs: acc.carbs + (log.carbs ?? 0),
      fat: acc.fat + (log.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

/**
 * Given a current value and a target, return progress info ready for a
 * progress bar / nutrient ring. `target <= 0` is treated as "no goal" and
 * yields 0% with `status = 'under'`.
 */
export function macroProgress(current: number, target: number): MacroProgress {
  if (!target || target <= 0) {
    return { current, target: 0, pct: 0, delta: current, status: 'under' }
  }
  const ratio = current / target
  const pct = Math.min(Math.round(ratio * 100), 100)
  const delta = current - target
  let status: MacroProgress['status']
  if (ratio < 1 - ON_TRACK_BAND) status = 'under'
  else if (ratio > 1 + ON_TRACK_BAND) status = 'over'
  else status = 'on-track'
  return { current, target, pct, delta, status }
}

/** Convenience: produce one progress object per macro in one call. */
export function macroProgressBundle(
  totals: MacroTotals,
  goals: MacroGoals
): Record<keyof MacroTotals, MacroProgress> {
  return {
    calories: macroProgress(totals.calories, goals.calories),
    protein: macroProgress(totals.protein, goals.protein),
    carbs: macroProgress(totals.carbs, goals.carbs),
    fat: macroProgress(totals.fat, goals.fat),
  }
}

/**
 * Net calorie balance — handy for the upcoming "kcal balance ring" on
 * the redesigned dashboard. Positive = surplus, negative = deficit.
 */
export function caloriesNet(intake: number, burn: number): number {
  return intake - burn
}
