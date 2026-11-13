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
  /**
   * Stable id for this session, created once and persisted with it. The server
   * saves the workout under this id, so sending the session again (after a
   * failed save or a lost response) can never create a second workout.
   */
  requestId: string
  /**
   * Edit counter: bumped by every change to the logged sets, and sent with
   * each save. It orders saves of this session, so the server can ignore a
   * late-arriving older snapshot, and the device can tell whether what the
   * server confirmed is still everything it holds.
   */
  revision: number
  planId: string
  dayId: string
  dayName: string
  startedAt: Date
  exercises: ExerciseProgress[]
}

export function createTrainingSession(planId: string, day: PlanDay): TrainingSession {
  return {
    requestId: crypto.randomUUID(),
    revision: 0,
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
  _setNumber: number,
  weightKg: number | null,
  reps: number | null
): TrainingSession {
  const updated = { ...session, revision: session.revision + 1, exercises: [...session.exercises] }
  const ex = { ...updated.exercises[exerciseIdx], completedSets: [...updated.exercises[exerciseIdx].completedSets] }
  ex.completedSets.push({ setNumber: ex.completedSets.length + 1, weightKg, reps, loggedAt: new Date() })
  updated.exercises[exerciseIdx] = ex
  return updated
}

export function removeSet(
  session: TrainingSession,
  exerciseIdx: number,
  setNumber: number
): TrainingSession {
  const updated = { ...session, revision: session.revision + 1, exercises: [...session.exercises] }
  const ex = { ...updated.exercises[exerciseIdx], completedSets: [...updated.exercises[exerciseIdx].completedSets] }
  ex.completedSets = ex.completedSets
    .filter((s) => s.setNumber !== setNumber)
    .map((s, idx) => ({ ...s, setNumber: idx + 1 }))
  updated.exercises[exerciseIdx] = ex
  return updated
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
  requestId: string
  revision: number
  planId: string
  dayId: string
  dayName: string
  startedAt: string
  exercises: SerializedExerciseProgress[]
}

export function serializeSession(session: TrainingSession): SerializedSession {
  return {
    requestId: session.requestId,
    revision: session.revision,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
      // Sessions saved before request ids existed get one now; it is written
      // back to storage with the session, so it stays stable from here on.
      requestId:
        typeof parsed.requestId === 'string' && UUID_RE.test(parsed.requestId)
          ? parsed.requestId
          : crypto.randomUUID(),
      // Sessions stored before revisions existed start counting from zero.
      revision:
        typeof parsed.revision === 'number' &&
        Number.isInteger(parsed.revision) &&
        parsed.revision >= 0
          ? parsed.revision
          : 0,
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

/**
 * Remove the stored session once the server has confirmed a save — but only
 * if what is stored is exactly the snapshot that was saved. Anything else is
 * left in place and `false` is returned, so no unsaved set is thrown away:
 * sets logged after the save was submitted (on this screen, or after the
 * screen was closed and resumed while the request was in flight), or a copy
 * of the session edited in another tab, which can reach the same revision
 * number with different sets.
 */
export function clearTrainingSessionIfSaved(
  params: { userId: string; planId: string; dayId: string; date: string },
  saved: TrainingSession
): boolean {
  if (typeof window === 'undefined') return false
  const stored = loadTrainingSession(params)
  if (
    stored &&
    JSON.stringify(serializeSession(stored)) !== JSON.stringify(serializeSession(saved))
  ) {
    return false
  }
  localStorage.removeItem(buildTrainingSessionKey(params))
  return true
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
