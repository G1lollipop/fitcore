'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabaseClient';
import { resolveLogTimestamp } from '@/lib/utils/date';
import { authedUserId } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats';
import { workoutLogInputSchema, firstZodError } from '@/lib/validation/schemas';
import type { WorkoutLogItem } from './types';

/**
 * Replaces an existing `workout_logs` row's fields in place, then recomputes
 * the daily_stats aggregate cache for that row's date. Mirrors updateDietLog:
 * a manual numeric edit (no AI re-parse), scoped to the owning user.
 */
export async function updateWorkoutLog(
  originalId: string,
  next: Pick<WorkoutLogItem, 'workout_name' | 'sets' | 'duration_minutes' | 'calories_burned'>
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!originalId) return { success: false, error: ActionError.MISSING_ORIGINAL_ID };

  const parsed = workoutLogInputSchema.safeParse(next);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  const { data: updated, error: updateError } = await supabase
    .from('workout_logs')
    .update({
      workout_name: parsed.data.workout_name,
      sets: parsed.data.sets,
      duration_minutes: parsed.data.duration_minutes,
      calories_burned: parsed.data.calories_burned,
    })
    .eq('id', originalId)
    .eq('user_id', userId)
    .select('id, date');

  if (updateError) {
    console.error('[updateWorkoutLog] Update error:', updateError.message);
    return { success: false, error: ActionError.DB_UPDATE_FAILED };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: ActionError.ORIGINAL_RECORD_GONE };
  }

  await recomputeDailyStats(userId, updated[0].date);

  revalidatePath('/');
  return { success: true };
}

export async function deleteWorkoutLog(
  logId: string
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!logId) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('workout_logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId)
    .select('id, date');

  if (deleteError) {
    console.error('[deleteWorkoutLog] Delete error:', deleteError.message);
    return { success: false, error: ActionError.DB_DELETE_FAILED };
  }

  if (!deleted || deleted.length === 0) {
    return { success: false, error: ActionError.RECORD_NOT_FOUND };
  }

  await recomputeDailyStats(userId, deleted[0].date);

  revalidatePath('/');
  return { success: true };
}

/**
 * Inserts a single manually-entered workout row (no AI parsing), then
 * recomputes the daily_stats aggregate. Mirrors `saveDietLog` for the food
 * side: the structured create-mode dialog builds the fields and this persists
 * them. An optional `dateStr` back-dates the row (historical-day editing) via
 * `resolveLogTimestamp`.
 */
export async function createWorkoutLog(
  input: Pick<WorkoutLogItem, 'workout_name' | 'sets' | 'duration_minutes' | 'calories_burned'>,
  dateStr?: string
): Promise<{ success: boolean; data?: WorkoutLogItem; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;

  const parsed = workoutLogInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  const { date, loggedAt } = resolveLogTimestamp(dateStr);
  const row: WorkoutLogItem = {
    id: randomUUID(),
    workout_name: parsed.data.workout_name,
    sets: parsed.data.sets,
    duration_minutes: parsed.data.duration_minutes,
    calories_burned: parsed.data.calories_burned,
    logged_at: loggedAt,
  };

  const { error: insertError } = await supabase.from('workout_logs').insert({
    id: row.id,
    user_id: userId,
    date,
    workout_name: row.workout_name,
    sets: row.sets,
    duration_minutes: row.duration_minutes,
    calories_burned: row.calories_burned,
    logged_at: row.logged_at,
  });

  if (insertError) {
    console.error('[createWorkoutLog] Insert error:', insertError.message);
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  await recomputeDailyStats(userId, date);

  revalidatePath('/');
  return { success: true, data: row };
}
