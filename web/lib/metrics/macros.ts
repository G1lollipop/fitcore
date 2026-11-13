/**
 * Macro / calorie aggregation shared by the Record tab's trend charts and
 * weekly summary. Pure and easy to unit-test.
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
