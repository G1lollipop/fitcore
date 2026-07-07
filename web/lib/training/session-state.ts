// web/lib/training/session-state.ts
import type { PlanDay, PlanExercise } from '@/lib/plans/types'

export interface CompletedSet {
  setNumber: number
  weightKg: number | null
  reps: number | null
  loggedAt: Date
}

export interface ExerciseProgress {
  exercise: PlanExercise
  completedSets: CompletedSet[]
}

export interface TrainingSession {
  planId: string
  dayId: string
  dayName: string
  startedAt: Date
  exercises: ExerciseProgress[]
}

export function createTrainingSession(planId: string, day: PlanDay): TrainingSession {
  return {
    planId,
    dayId: (day as { id?: string }).id ?? '',
    dayName: day.name,
    startedAt: new Date(),
    exercises: day.exercises.map((ex) => ({
      exercise: ex,
      completedSets: [],
    })),
  }
}

export function logSet(
  session: TrainingSession,
  exerciseIdx: number,
  setNumber: number,
  weightKg: number | null,
  reps: number | null
): TrainingSession {
  const updated = { ...session, exercises: [...session.exercises] }
  const ex = { ...updated.exercises[exerciseIdx], completedSets: [...updated.exercises[exerciseIdx].completedSets] }
  ex.completedSets.push({ setNumber, weightKg, reps, loggedAt: new Date() })
  updated.exercises[exerciseIdx] = ex
  return updated
}

export function isSessionComplete(session: TrainingSession): boolean {
  return session.exercises.every((ex) =>
    ex.completedSets.length >= (ex.exercise.sets ?? 0)
  )
}

export function getSessionSummary(session: TrainingSession) {
  const totalSets = session.exercises.reduce((sum, ex) => sum + ex.completedSets.length, 0)
  const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000)
  return { totalSets, elapsed }
}
