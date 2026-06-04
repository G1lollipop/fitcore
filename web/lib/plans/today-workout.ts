/**
 * Pure helper extracted from `components/my-plans.tsx`.
 *
 * Given a workout plan (with days, exercises, and an optional `rest_days`
 * list), determine which workout day applies to a given date.
 *
 * Rules — preserved verbatim from the original `calculateTodayWorkout`:
 *   1. ISO weekday index is 0..6 with Monday = 0 (so Sunday wraps to 6).
 *   2. If `rest_days` includes today's ISO weekday (1..7, where 1 = Mon),
 *      today is a rest day. We still surface the first sorted day so the
 *      UI has something to show, but with `isRestDay = true` and zero
 *      exercises.
 *   3. Otherwise we count past non-rest days in the week to pick the
 *      adjusted index into the sorted day list. If the plan has no
 *      `rest_days`, we look up by `day_order` directly, falling back to
 *      modulo when no exact match exists.
 *   4. If we still have nothing, fall back to the first sorted day.
 *
 * The function is pure: pass `now` to make it deterministic in tests.
 */

export interface PlanExerciseRow {
  id: string
  target_sets?: number | null
  target_reps_min?: number | null
  target_reps_max?: number | null
  target_weight_kg?: number | null
  exercises?: { name?: string | null } | null
}

export interface WorkoutDayRow {
  id: string
  name?: string | null
  day_order?: number | null
  plan_exercises?: PlanExerciseRow[] | null
}

export interface PlanInput {
  workout_days?: WorkoutDayRow[] | null
  /** Optional list of ISO-weekday numbers (1 = Mon … 7 = Sun) marked as rest. */
  rest_days?: number[] | null
}

export interface TodayWorkoutExercise {
  id: string
  text: string
  exerciseName?: string
  sets?: number | null
  repsMin?: number | null
  repsMax?: number | null
  weight?: number | null
}

export interface TodayWorkoutResult {
  todayDay: (WorkoutDayRow & { isRestDay?: boolean }) | null
  isRestDay: boolean
  exercises: TodayWorkoutExercise[]
}

/** Convert a JS `Date.getDay()` (0 = Sun) to an ISO weekday index (0 = Mon … 6 = Sun). */
function isoWeekdayIndex(date: Date): number {
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1
}

function formatExerciseText(pe: PlanExerciseRow): string {
  const name = pe.exercises?.name ?? '未知动作'
  const sets = pe.target_sets ?? 0
  const min = pe.target_reps_min ?? 0
  const max = pe.target_reps_max ?? 0
  return `${name} ${sets}组 ${min}-${max}次`
}

function mapExercises(day: WorkoutDayRow | null | undefined): TodayWorkoutExercise[] {
  const list = day?.plan_exercises ?? []
  return list.map((pe) => ({
    id: pe.id,
    text: formatExerciseText(pe),
    exerciseName: pe.exercises?.name ?? undefined,
    sets: pe.target_sets ?? undefined,
    repsMin: pe.target_reps_min ?? undefined,
    repsMax: pe.target_reps_max ?? undefined,
    weight: pe.target_weight_kg ?? undefined,
  }))
}

/**
 * Compute today's workout (or rest day) from a plan.
 *
 * @param plan - the active plan, with days and exercises eagerly loaded
 * @param now - injected clock for deterministic testing (defaults to `new Date()`)
 * @returns null when the plan has no days at all; otherwise a result object
 */
export function calculateTodayWorkout(
  plan: PlanInput | null | undefined,
  now: Date = new Date()
): TodayWorkoutResult | null {
  const days = plan?.workout_days ?? []
  if (days.length === 0) return null

  const todayIndex = isoWeekdayIndex(now)
  const restDays = plan?.rest_days ?? []
  const sortedDays = [...days].sort((a, b) => (a.day_order ?? 0) - (b.day_order ?? 0))

  const isRestDay = restDays.length > 0 && restDays.includes(todayIndex + 1)

  if (isRestDay) {
    const placeholder = sortedDays[0]
      ? { ...sortedDays[0], name: '休息日', isRestDay: true }
      : null
    return { todayDay: placeholder, isRestDay: true, exercises: [] }
  }

  let todayDay: WorkoutDayRow | null = null

  if (restDays.length > 0) {
    let dayCount = 0
    for (let i = 0; i <= todayIndex; i++) {
      if (!restDays.includes(i + 1)) dayCount++
    }
    const adjustedIndex = Math.max(0, (dayCount - 1) % sortedDays.length)
    todayDay = sortedDays[adjustedIndex] ?? sortedDays[0] ?? null
  } else {
    todayDay =
      sortedDays.find((d) => d.day_order === todayIndex + 1) ??
      sortedDays[todayIndex % sortedDays.length] ??
      null
  }

  if (!todayDay) {
    todayDay = sortedDays[0] ?? null
  }

  return {
    todayDay,
    isRestDay: false,
    exercises: mapExercises(todayDay),
  }
}
