'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import { authedUserId } from '@/lib/auth/require-user';
import { dietLogInputSchema, firstZodError } from '@/lib/validation/schemas';
import { ActionError } from '@/lib/errors';
import type { DietLogItem } from './types';

type DailyStatsRow = Database['public']['Tables']['daily_stats']['Row'];

/**
 * Replaces an existing diet_log entry within today's daily_stats row,
 * recomputing the aggregate macro totals by diff (next − prev).
 *
 * Backs the meal-photo "调整" path: a high-confidence parse auto-saves,
 * then the success toast offers an "调整" action that re-opens the review
 * dialog. Saving from that dialog calls updateDietLog so the entry is
 * replaced in place rather than producing a duplicate row.
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

  const today = getTodayDate();

  const { data, error: queryError } = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (queryError) {
    return { success: false, error: ActionError.DB_QUERY_FAILED };
  }

  const row = data as DailyStatsRow | null;
  if (!row) return { success: false, error: ActionError.TODAY_RECORD_NOT_FOUND };

  const logs = (row.diet_logs as DietLogItem[]) || [];
  const prev = logs.find((l) => l.id === originalId);
  if (!prev) {
    return { success: false, error: ActionError.ORIGINAL_RECORD_GONE };
  }

  const updatedLogs = logs.map((l) =>
    l.id === originalId ? { ...next, id: originalId, logged_at: prev.logged_at } : l
  );

  const updateData = {
    total_calories: (row.total_calories ?? 0) - prev.calories + next.calories,
    total_protein: (row.total_protein ?? 0) - prev.protein + next.protein,
    total_carbs: (row.total_carbs ?? 0) - prev.carbs + next.carbs,
    total_fat: (row.total_fat ?? 0) - prev.fat + next.fat,
    diet_logs: updatedLogs,
  };

  const { error: updateError } = await supabase
    .from('daily_stats')
    .update(updateData)
    .eq('id', row.id);

  if (updateError) {
    return { success: false, error: ActionError.DB_UPDATE_FAILED };
  }

  revalidatePath('/');
  return { success: true };
}
