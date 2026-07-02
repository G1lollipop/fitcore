/**
 * Shared shape for the JSON-stored workout plan (`workout_plans.structure`).
 *
 * Plans are AI-first: the LLM (or the user, by typing) produces free-text
 * exercises — there is no exercise library / foreign keys anymore. `days` is a
 * 7-element array (Monday → Sunday); rest days carry `rest_day: true` and an
 * empty `exercises` list.
 */

export interface PlanExercise {
  /** Free-text exercise name, e.g. "Bench Press". */
  name: string
  sets?: number | null
  reps_min?: number | null
  reps_max?: number | null
  /** Optional target weight in kg. */
  weight?: number | null
}

export interface PlanDay {
  /** Day label, e.g. "Push" or "Rest". */
  name: string
  rest_day: boolean
  exercises: PlanExercise[]
}

export interface PlanStructure {
  days: PlanDay[]
}

/** Plan preview payload carried from the AI coach to the plan detail sheet. */
export interface PlanPreviewPayload {
  name: string
  description?: string | null
  goal?: string | null
  experience_level?: string | null
  duration_weeks?: number | null
  frequency_per_week: number
  days: PlanDay[]
  aiPrompt?: string | null
  isAiGenerated?: boolean
}

/** A blank 7-day (Mon–Sun) all-rest structure. */
export function emptyPlanStructure(): PlanStructure {
  return {
    days: Array.from({ length: 7 }, () => ({
      name: 'Rest',
      rest_day: true,
      exercises: [],
    })),
  }
}

/**
 * Coerce an unknown value (e.g. Supabase `jsonb`) into a well-formed
 * `PlanStructure`, dropping malformed entries and padding to 7 days so
 * downstream weekday mapping stays consistent.
 */
export function normalizePlanStructure(raw: unknown): PlanStructure {
  const base = emptyPlanStructure()
  if (!raw || typeof raw !== 'object') return base

  const daysRaw = (raw as { days?: unknown }).days
  if (!Array.isArray(daysRaw)) return base

  const days: PlanDay[] = daysRaw.slice(0, 7).map((d, i) => {
    const day = (d ?? {}) as Record<string, unknown>
    const rest = day.rest_day === true
    const exercisesRaw = Array.isArray(day.exercises) ? day.exercises : []
    const exercises: PlanExercise[] = rest
      ? []
      : exercisesRaw
          .map((e): PlanExercise | null => {
            const ex = (e ?? {}) as Record<string, unknown>
            const name = typeof ex.name === 'string' ? ex.name.trim() : ''
            if (!name) return null
            const num = (v: unknown): number | null =>
              typeof v === 'number' && Number.isFinite(v) ? v : null
            return {
              name,
              sets: num(ex.sets),
              reps_min: num(ex.reps_min),
              reps_max: num(ex.reps_max),
              weight: num(ex.weight),
            }
          })
          .filter((e): e is PlanExercise => e !== null)

    return {
      name: typeof day.name === 'string' && day.name.trim() ? day.name.trim() : rest ? 'Rest' : `Day ${i + 1}`,
      rest_day: rest || exercises.length === 0,
      exercises,
    }
  })

  while (days.length < 7) {
    days.push({ name: 'Rest', rest_day: true, exercises: [] })
  }

  return { days }
}

/** Human-readable one-line summary of an exercise (name + sets×reps + weight). */
export function formatPlanExercise(ex: PlanExercise): string {
  let text = ex.name
  if (ex.sets && ex.sets > 0) {
    text += ` ${ex.sets} sets`
    if (ex.reps_min && ex.reps_max) text += ` ${ex.reps_min}-${ex.reps_max} reps`
    else if (ex.reps_min) text += ` ${ex.reps_min} reps`
  }
  if (ex.weight) text += ` ${ex.weight}kg`
  return text
}
