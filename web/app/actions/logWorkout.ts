'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { openai } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabaseClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';
import { Database } from '@/lib/database.types';
import { getTodayDate, resolveLogTimestamp } from '@/lib/utils/date';
import { authedUserId, getUserIdOrNull } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats';
import { workoutLogInputSchema, firstZodError } from '@/lib/validation/schemas';
import type { WorkoutLogItem } from './types';

type WorkoutLogInsert = Database['public']['Tables']['workout_logs']['Insert'];

async function parseWorkoutWithAI(userInput: string): Promise<WorkoutLogItem | null> {
  try {
    const response = await openai.chat.completions.create({
      model: AI_FAST_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a professional fitness assistant. Based on the workout the user describes, accurately parse the workout data.

Key rules:
1. Identify the workout name, number of sets, duration, and calories burned.
2. Reference calorie burn for common exercises (60kg adult):
   - Squat: ~8-10 kcal per 10 reps
   - Bench press: ~6-8 kcal per 10 reps
   - Deadlift: ~10-12 kcal per 10 reps
   - Running: ~10-12 kcal per minute (depends on pace)
   - Pull-up: ~8-10 kcal per 10 reps
   - Push-up: ~5-7 kcal per 10 reps
   - Jump rope: ~12-15 kcal per minute
   - Swimming: ~8-10 kcal per minute
   - Cycling: ~6-10 kcal per minute
3. Compute total burn from sets and duration.
4. If the user doesn't specify a duration, estimate it from the sets and time per set.

Return JSON: {workout_name, sets, duration_minutes, calories_burned}
- workout_name: workout name (e.g. "Squat", "Running")
- sets: number of sets, integer (e.g. 4); null if not mentioned
- duration_minutes: duration in minutes, integer
- calories_burned: calories burned (kcal), integer`,
        },
        {
          role: 'user',
          content: userInput,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const result = {
      id: randomUUID(),
      workout_name: parsed.workout_name || 'Unknown workout',
      sets: parsed.sets ? Math.round(Number(parsed.sets)) : null,
      duration_minutes: Math.round(Number(parsed.duration_minutes)) || 0,
      calories_burned: Math.round(Number(parsed.calories_burned)) || 0,
      logged_at: new Date().toISOString(),
    };

    return result;
  } catch (error) {
    console.error('AI parsing error:', error);
    return null;
  }
}

export async function logWorkout(
  userInput: string,
  planContext?: { planId?: string; dayId?: string },
  dateStr?: string
): Promise<{ success: boolean; data?: WorkoutLogItem; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!userInput) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const workoutData = await parseWorkoutWithAI(userInput);
  if (!workoutData) {
    return { success: false, error: ActionError.AI_PARSE_FAILED };
  }

  if (planContext?.planId) {
    workoutData.plan_id = planContext.planId;
  }
  if (planContext?.dayId) {
    workoutData.day_id = planContext.dayId;
  }

  // Allow back-dated entries (historical-day editing); defaults to today.
  const { date, loggedAt } = resolveLogTimestamp(dateStr);
  workoutData.logged_at = loggedAt;

  const { error: insertError } = await supabase.from('workout_logs').insert({
    id: workoutData.id,
    user_id: userId,
    date,
    workout_name: workoutData.workout_name,
    sets: workoutData.sets,
    duration_minutes: workoutData.duration_minutes,
    calories_burned: workoutData.calories_burned,
    plan_id: workoutData.plan_id ?? null,
    day_id: workoutData.day_id ?? null,
    logged_at: workoutData.logged_at,
  });

  if (insertError) {
    console.error('[logWorkout] Insert error:', insertError.message);
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  await recomputeDailyStats(userId, date);

  revalidatePath('/');
  return { success: true, data: workoutData };
}

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
 * `resolveLogTimestamp`, matching `logWorkout(text, ctx, dateStr)`.
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

export async function batchLogWorkouts(
  workouts: Array<{ name: string; sets?: number | null; duration_minutes?: number; calories_burned?: number }>
): Promise<{ success: boolean; count?: number; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!workouts || workouts.length === 0) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const today = getTodayDate();
  const now = new Date().toISOString();

  const rows: WorkoutLogInsert[] = workouts.map((w) => ({
    id: randomUUID(),
    user_id: userId,
    date: today,
    workout_name: w.name,
    sets: w.sets ?? null,
    duration_minutes: w.duration_minutes || 0,
    calories_burned: w.calories_burned || 0,
    logged_at: now,
  }));

  const { error: insertError } = await supabase.from('workout_logs').insert(rows);

  if (insertError) {
    console.error('[batchLogWorkouts] Insert error:', insertError.message);
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  await recomputeDailyStats(userId, today);

  revalidatePath('/');
  return { success: true, count: rows.length };
}
