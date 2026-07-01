'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabaseClient';
import { getTodayDate, resolveLogTimestamp } from '@/lib/utils/date';
import { authedUserId } from '@/lib/auth/require-user';
import { dietLogInputSchema, firstZodError } from '@/lib/validation/schemas';
import { ActionError } from '@/lib/errors';
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats';
import type { DietLogItem } from './types';

/**
 * Persists a pre-parsed DietLogItem as a `food_logs` row, then recomputes the
 * daily_stats aggregate cache.
 *
 * Extracted from logFood.ts so multiple parsing paths (text input, photo
 * vision, future voice) can share a single write path. The "parse first,
 * confirm, then save" pattern used by the photo flow needs this split:
 * parsing returns the item to the UI for review; saving happens only after
 * the user confirms.
 *
 * Also backs the manual structured-entry path: passing an optional `dateStr`
 * (matching the `logFood(text, dateStr)` pattern) back-dates the row to that
 * calendar day via `resolveLogTimestamp`, so a manual food entry lands on the
 * day the user is viewing in History. When omitted, the row keeps the
 * caller-supplied `logged_at` on today (photo / vision paths).
 */
export async function saveDietLog(
  item: DietLogItem,
  dateStr?: string
): Promise<{ success: boolean; data?: DietLogItem; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!item) return { success: false, error: ActionError.MISSING_FOOD_DATA };

  const parsed = dietLogInputSchema.safeParse(item);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  // Back-date when a target day is supplied; otherwise keep today + the
  // caller's precise timestamp (preserves existing photo-flow behavior).
  const { date, loggedAt } = dateStr
    ? resolveLogTimestamp(dateStr)
    : { date: getTodayDate(), loggedAt: item.logged_at };

  const { error: insertError } = await supabase.from('food_logs').insert({
    id: item.id,
    user_id: userId,
    date,
    food_name: item.food_name,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    logged_at: loggedAt,
  });

  if (insertError) {
    console.error('[saveDietLog] Insert error:', insertError.message);
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  await recomputeDailyStats(userId, date);

  revalidatePath('/');
  return { success: true, data: { ...item, logged_at: loggedAt } };
}
