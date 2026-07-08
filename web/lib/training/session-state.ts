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

export function removeSet(
  session: TrainingSession,
  exerciseIdx: number,
  setNumber: number
): TrainingSession {
  const updated = { ...session, exercises: [...session.exercises] }
  const ex = { ...updated.exercises[exerciseIdx], completedSets: [...updated.exercises[exerciseIdx].completedSets] }
  ex.completedSets = ex.completedSets.filter((s) => s.setNumber !== setNumber)
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

// ── localStorage persistence ────────────────────────────────────────────────

interface SerializedCompletedSet {
  setNumber: number
  weightKg: number | null
  reps: number | null
  loggedAt: string
}

interface SerializedExerciseProgress {
  exercise: PlanExercise
  completedSets: SerializedCompletedSet[]
}

interface SerializedSession {
  planId: string
  dayId: string
  dayName: string
  startedAt: string
  exercises: SerializedExerciseProgress[]
}

export function serializeSession(session: TrainingSession): SerializedSession {
  return {
    planId: session.planId,
    dayId: session.dayId,
    dayName: session.dayName,
    startedAt: session.startedAt.toISOString(),
    exercises: session.exercises.map((ex) => ({
      exercise: ex.exercise,
      completedSets: ex.completedSets.map((set) => ({
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        loggedAt: set.loggedAt.toISOString(),
      })),
    })),
  }
}

export function deserializeSession(raw: string): TrainingSession | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    if (
      typeof parsed.planId !== 'string' ||
      typeof parsed.dayName !== 'string' ||
      typeof parsed.startedAt !== 'string' ||
      !Array.isArray(parsed.exercises)
    ) {
      return null
    }
    const startedAt = new Date(parsed.startedAt)
    if (isNaN(startedAt.getTime())) return null

    const exercises = parsed.exercises.map((exRaw: unknown): ExerciseProgress | null => {
      const ex = exRaw as Record<string, unknown>
      if (!ex || typeof ex !== 'object' || !ex.exercise) return null
      const completedSets = Array.isArray(ex.completedSets)
        ? (ex.completedSets as Array<Record<string, unknown>>)
            .map((set): CompletedSet | null => {
              const loggedAt = new Date(set.loggedAt as string)
              if (isNaN(loggedAt.getTime())) return null
              return {
                setNumber: set.setNumber as number,
                weightKg: (set.weightKg as number) ?? null,
                reps: (set.reps as number) ?? null,
                loggedAt,
              }
            })
            .filter((s): s is CompletedSet => s !== null)
        : []

      return {
        exercise: ex.exercise as PlanExercise,
        completedSets,
      }
    }).filter((e): e is ExerciseProgress => e !== null)

    return {
      planId: parsed.planId as string,
      dayId: (parsed.dayId as string) ?? '',
      dayName: parsed.dayName as string,
      startedAt,
      exercises,
    }
  } catch {
    return null
  }
}

export function buildTrainingSessionKey(params: {
  userId: string
  planId: string
  dayId: string
  date: string
}): string {
  return `fitcore-training-session:${params.userId}:${params.planId}:${params.dayId}:${params.date}`
}

export function saveTrainingSession(
  session: TrainingSession,
  params: { userId: string; planId: string; dayId: string; date: string }
): void {
  if (typeof window === 'undefined') return
  const key = buildTrainingSessionKey(params)
  const serialized = serializeSession(session)
  localStorage.setItem(key, JSON.stringify(serialized))
}

export function loadTrainingSession(params: {
  userId: string
  planId: string
  dayId: string
  date: string
}): TrainingSession | null {
  if (typeof window === 'undefined') return null
  const key = buildTrainingSessionKey(params)
  const raw = localStorage.getItem(key)
  if (!raw) return null
  return deserializeSession(raw)
}

export function clearTrainingSession(params: {
  userId: string
  planId: string
  dayId: string
  date: string
}): void {
  if (typeof window === 'undefined') return
  const key = buildTrainingSessionKey(params)
  localStorage.removeItem(key)
}
