'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
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
  next: DietLogItem,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId) return { success: false, error: '缺少用户 ID' };
  if (!originalId) return { success: false, error: '缺少原记录 ID' };

  const today = getTodayDate();

  const { data, error: queryError } = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (queryError) {
    return { success: false, error: `查询失败: ${queryError.message}` };
  }

  const row = data as DailyStatsRow | null;
  if (!row) return { success: false, error: '今日记录不存在' };

  const logs = (row.diet_logs as DietLogItem[]) || [];
  const prev = logs.find((l) => l.id === originalId);
  if (!prev) {
    return { success: false, error: '原记录已不存在，请重新记录' };
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
    // @ts-ignore - Supabase types issue
    .update(updateData)
    .eq('id', row.id);

  if (updateError) {
    return { success: false, error: `更新失败: ${updateError.message}` };
  }

  revalidatePath('/');
  return { success: true };
}
