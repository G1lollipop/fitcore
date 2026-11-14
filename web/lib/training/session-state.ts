// web/lib/training/session-state.ts
import type { PlanDay, PlanExercise } from '@/lib/plans/types'
import { toLocalDateStr } from '@/lib/utils/date'

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
 * The zone the app calendar was kept in before it moved to America/Chicago.
 * Drafts are stored under the calendar date of the day they were started, so
 * one started before the move sits under that zone's date — a day ahead of the
 * current app date for much of the day.
 */
const PREVIOUS_APP_TIME_ZONE = 'Asia/Shanghai'

/** When the user last touched a draft: its start, or its latest logged set. */
function lastActivity(session: TrainingSession): number {
  return Math.max(
    session.startedAt.getTime(),
    ...session.exercises.flatMap((ex) => ex.completedSets.map((set) => set.loggedAt.getTime()))
  )
}

/** Whether `candidate` should be resumed in preference to `other`. */
function isNewerDraft(candidate: TrainingSession, other: TrainingSession): boolean {
  // Two copies of one session: the edit counter says which is ahead.
  if (candidate.requestId === other.requestId) return candidate.revision > other.revision
  return lastActivity(candidate) > lastActivity(other)
}

export interface ResumableTrainingSession {
  session: TrainingSession
  /** The date the draft is stored under; keep reading and writing it there. */
  date: string
  /** True when that is the previous zone's date rather than today's. */
  legacy: boolean
}

/**
 * The unfinished workout to resume for today, if any.
 *
 * Normally that is the draft stored under today's date. While the previous
 * zone's date differs from today's, a draft stored under *that* date is an
 * unfinished workout from before the zone change, and is found too — otherwise
 * it would vanish until the app calendar catches up with it.
 *
 * This only reads. A draft is resumed where it is stored (`date`), with its
 * request id, revision and sets as they are; nothing is copied, moved or
 * removed, so no draft can be overwritten. If both dates hold a draft, the one
 * the user touched most recently is resumed and the other is left as it is.
 */
export function findResumableTrainingSession(
  params: { userId: string; planId: string; dayId: string; date: string },
  now: Date = new Date()
): ResumableTrainingSession | null {
  const current = loadTrainingSession(params)
  const previousDate = toLocalDateStr(now, PREVIOUS_APP_TIME_ZONE)
  const previous =
    previousDate === params.date ? null : loadTrainingSession({ ...params, date: previousDate })

  if (previous && (!current || isNewerDraft(previous, current))) {
    return { session: previous, date: previousDate, legacy: true }
  }
  return current ? { session: current, date: params.date, legacy: false } : null
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
