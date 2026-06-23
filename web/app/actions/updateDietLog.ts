'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabaseClient';
import { authedUserId } from '@/lib/auth/require-user';
import { dietLogInputSchema, firstZodError } from '@/lib/validation/schemas';
import { ActionError } from '@/lib/errors';
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats';
import type { DietLogItem } from './types';

/**
 * Replaces an existing `food_logs` row's nutrition values in place, then
 * recomputes the daily_stats aggregate cache for that row's date.
 *
 * Backs the meal-photo "Adjust" path: a high-confidence parse auto-saves, then
 * the success toast offers an "Adjust" action that re-opens the review dialog.
 * Saving from that dialog calls updateDietLog so the entry is replaced in
 * place rather than producing a duplicate row.
 */
export async function updateDietLog(
  originalId: string,
  next: DietLogItem
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!originalId) return { success: false, error: ActionError.MISSING_ORIGINAL_ID };

  const parsed = dietLogInputSchema.safeParse(next);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  const { data: updated, error: updateError } = await supabase
    .from('food_logs')
    .update({
      food_name: next.food_name,
      calories: next.calories,
      protein: next.protein,
      carbs: next.carbs,
      fat: next.fat,
    })
    .eq('id', originalId)
    .eq('user_id', userId)
    .select('id, date');

  if (updateError) {
    console.error('[updateDietLog] Update error:', updateError.message);
    return { success: false, error: ActionError.DB_UPDATE_FAILED };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: ActionError.ORIGINAL_RECORD_GONE };
  }

  await recomputeDailyStats(userId, updated[0].date);

  revalidatePath('/');
  return { success: true };
}
