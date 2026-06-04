/**
 * Water-tracking math used by the dashboard stats card.
 * All values are in millilitres unless noted.
 */

export const DEFAULT_WATER_GOAL_ML = 2500
export const WATER_INCREMENT_ML = 250

/** Format a millilitre value as a human-readable litre string ("1.5"). */
export function mlToLiters(ml: number, fractionDigits = 1): string {
  return (ml / 1000).toFixed(fractionDigits)
}

/**
 * Compute progress as an integer percentage clamped to [0, 100].
 * A goal of 0 (misconfiguration) reports 0% rather than dividing by zero.
 */
export function waterProgressPct(intakeMl: number, goalMl: number): number {
  if (!goalMl || goalMl <= 0) return 0
  return Math.min(Math.round((intakeMl / goalMl) * 100), 100)
}

export interface WaterStats {
  intakeLiters: string
  goalLiters: string
  progressPct: number
  remainingMl: number
}

/** Single-call summary used to populate the water stats card. */
export function summarizeWater(intakeMl = 0, goalMl = DEFAULT_WATER_GOAL_ML): WaterStats {
  return {
    intakeLiters: mlToLiters(intakeMl),
    goalLiters: mlToLiters(goalMl),
    progressPct: waterProgressPct(intakeMl, goalMl),
    remainingMl: Math.max(0, goalMl - intakeMl),
  }
}
