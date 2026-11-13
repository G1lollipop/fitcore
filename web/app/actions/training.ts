'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { authedUserId } from '@/lib/auth/require-user'
import type { Json } from '@/lib/database.types'
import { ActionError } from '@/lib/errors'
import { supabase } from '@/lib/supabaseClient'
import { getTodayDate } from '@/lib/utils/date'

/** A finished session can't plausibly run longer than this; guards a stale/forged `startedAt`. */
const MAX_SESSION_MINUTES = 12 * 60

const finishTrainingSchema = z.object({
  // Generated once per session on the device and reused on every retry; the
  // database uses it as the workout's id, which is what makes retries safe.
  requestId: z.string().uuid(),
  // The session's edit counter at the moment this snapshot was taken. The
  // database refuses to replace a stored snapshot with an older one.
  revision: z.number().int().min(0).max(2_147_483_647),
  planId: z.string().uuid(),
  workoutName: z.string().trim().min(1).max(200),
  startedAt: z.string().datetime(),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        completedSets: z
          .array(
            z.object({
              setNumber: z.number().int().min(1).max(1000),
              weightKg: z.number().finite().min(0).max(2000).nullable(),
              reps: z.number().int().min(0).max(10_000).nullable(),
            })
          )
          .max(200),
      })
    )
    .max(100),
})

export type FinishTrainingInput = z.infer<typeof finishTrainingSchema>

/**
 * Persist a finished in-app training session: one summary `workout_logs` row
 * plus one `workout_set_logs` row per completed set.
 *
 * Everything — both tables and the daily aggregate refresh — is written by the
 * `finish_training_session` database function in a single transaction, so
 * `success: true` means exactly the snapshot passed to this call is what the
 * server stores — written now, or already stored by an earlier identical call
 * (a retry after a failure or a lost response never adds a second workout).
 * `revision` echoes the revision that was confirmed. `success: false` means
 * this call stored nothing.
 *
 * `SAVE_CONFLICT` means the server holds a different save of this session and
 * left it untouched: either a newer revision, or the same revision with
 * different sets (the session was edited in two places). The caller must keep
 * its local copy.
 */
export async function finishTrainingSession(
  input: FinishTrainingInput
): Promise<
  | { success: true; workoutLogId: string; revision: number }
  | { success: false; error: string }
> {
  const a = await authedUserId()
  if (!a.ok) return a.result
  const userId = a.userId

  const parsed = finishTrainingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: ActionError.VALIDATION_FAILED }
  }
  const { requestId, revision, planId, workoutName, startedAt, exercises } = parsed.data

  const sets = exercises.flatMap((ex) =>
    ex.completedSets.map((set) => ({
      exercise_name: ex.name,
      set_number: set.setNumber,
      weight_kg: set.weightKg,
      reps: set.reps,
    }))
  )
  const totalWeight = sets.reduce((sum, set) => sum + (set.weight_kg ?? 0) * (set.reps ?? 0), 0)
  const estimatedCalories = Math.round(totalWeight * 0.1) // rough estimate
  const elapsedMinutes = Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
  const durationMinutes = Math.min(Math.max(elapsedMinutes, 1), MAX_SESSION_MINUTES)

  const { data, error } = await supabase.rpc('finish_training_session', {
    p_user_id: userId,
    p_request_id: requestId,
    p_revision: revision,
    // Same calendar day the dashboard reads (`getTodayDate`), not the UTC date
    // — otherwise a session finished after local midnight lands on yesterday.
    p_date: getTodayDate(),
    p_plan_id: planId,
    p_workout_name: workoutName,
    p_duration_minutes: durationMinutes,
    p_calories_burned: estimatedCalories,
    p_sets: sets as unknown as Json,
  })

  if (error) {
    console.error('[finishTrainingSession] atomic save error:', error.message)
    return { success: false, error: ActionError.DB_INSERT_FAILED }
  }

  const reply = data && typeof data === 'object' && !Array.isArray(data) ? data : null
  if (!reply || reply.workout_log_id !== requestId) {
    console.error('[finishTrainingSession] atomic save returned an invalid result')
    return { success: false, error: ActionError.DB_INSERT_FAILED }
  }

  // The server holds a different save of this session (a newer revision, or
  // other sets at this revision) and did not touch it.
  if (reply.status === 'stale' || reply.status === 'conflict') {
    return { success: false, error: ActionError.SAVE_CONFLICT }
  }

  // Success is reported only for the snapshot sent in this call: written now
  // ('saved') or already stored identically ('unchanged'), at this revision.
  // Anything else must leave the client holding its local copy.
  if (
    (reply.status !== 'saved' && reply.status !== 'unchanged') ||
    reply.revision !== revision
  ) {
    console.error('[finishTrainingSession] atomic save returned an invalid result')
    return { success: false, error: ActionError.DB_INSERT_FAILED }
  }

  revalidatePath('/')
  return { success: true, workoutLogId: requestId, revision }
}
