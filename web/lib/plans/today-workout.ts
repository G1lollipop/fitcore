/**
 * Pick today's session from a JSON plan structure.
 *
 * Plans store a 7-element `days` array (Monday → Sunday). Today's session is
 * simply `days[isoWeekdayIndex(now)]`; a day is "rest" when flagged or empty.
 * Pure: pass `now` to make it deterministic in tests.
 */

import {
  formatPlanExercise,
  normalizePlanStructure,
  type PlanDay,
  type PlanStructure,
} from './types'

export interface TodayWorkoutExercise {
  /** Synthetic, stable-per-render id (no DB rows anymore). */
  id: string
  /** Pre-formatted "name N sets A-B reps" line. */
  text: string
  exerciseName: string
  sets?: number | null
  repsMin?: number | null
  repsMax?: number | null
  weight?: number | null
}

export interface TodayWorkoutResult {
  todayDay: PlanDay | null
  /** ISO weekday position 1..7 (1 = Mon, 7 = Sun). */
  dayIndex: number
  isRestDay: boolean
  exercises: TodayWorkoutExercise[]
}

/** Convert a JS `Date.getDay()` (0 = Sun) to an ISO weekday index (0 = Mon … 6 = Sun). */
function isoWeekdayIndex(date: Date): number {
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1
}

/**
 * Compute today's workout (or rest day) from a plan structure.
 *
 * @param structure - the active plan's JSON structure (or anything coercible)
 * @param now - injected clock for deterministic testing (defaults to `new Date()`)
 * @returns null when the plan has no days at all
 */
export function calculateTodayWorkout(
  structure: PlanStructure | unknown | null | undefined,
  now: Date = new Date()
): TodayWorkoutResult | null {
  if (!structure) return null
  const { days } = normalizePlanStructure(structure)
  if (days.length === 0) return null

  const idx = isoWeekdayIndex(now)
  const day = days[idx] ?? null
  if (!day) return null

  const isRestDay = day.rest_day || day.exercises.length === 0
  const exercises: TodayWorkoutExercise[] = isRestDay
    ? []
    : day.exercises.map((ex, i) => ({
        id: `${idx}-${i}`,
        text: formatPlanExercise(ex),
        exerciseName: ex.name,
        sets: ex.sets ?? undefined,
        repsMin: ex.reps_min ?? undefined,
        repsMax: ex.reps_max ?? undefined,
        weight: ex.weight ?? undefined,
      }))

  return { todayDay: day, dayIndex: idx + 1, isRestDay, exercises }
}
