/** A single exercise the user has picked, with their per-set targets. */
export interface SelectedExercise {
  exercise_id: string
  name: string
  name_en?: string
  target_sets: number
  target_reps_min: number
  target_reps_max: number
  target_weight_kg?: number
  muscle_groups: string[]
}

/** All filter values applied to the exercise grid. */
export interface ExerciseFilters {
  /** Free-text search. The orchestrator debounces this before passing it to data fetching. */
  search: string
  muscleGroup: string
  equipment: string
  difficulty: string
}

export const EMPTY_FILTERS: ExerciseFilters = {
  search: '',
  muscleGroup: '',
  equipment: '',
  difficulty: '',
}

/** Numeric fields on a SelectedExercise that the inline +/- controls can mutate. */
export type SortableField = 'target_sets' | 'target_reps_min' | 'target_reps_max'
