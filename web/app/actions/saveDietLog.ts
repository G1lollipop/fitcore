'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import type { DietLogItem } from './types';

type DailyStatsRow = Database['public']['Tables']['daily_stats']['Row'];
type DailyStatsInsert = Database['public']['Tables']['daily_stats']['Insert'];

/**
 * Persists a pre-parsed DietLogItem to today's daily_stats row.
 *
 * Extracted from logFood.ts so multiple parsing paths (text input, photo
 * vision, future voice) can share a single write path. The "parse first,
 * confirm, then save" pattern used by the photo flow needs this split:
 * parsing returns the item to the UI for review; saving happens only after
 * the user confirms.
 */
export async function saveDietLog(
  item: DietLogItem,
  userId: string
): Promise<{ success: boolean; data?: DietLogItem; error?: string }> {
  if (!userId) return { success: false, error: '缺少用户 ID' };
  if (!item) return { success: false, error: '缺少食物数据' };

  const today = getTodayDate();

  const queryResult = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const existingRecord = queryResult.data as DailyStatsRow | null;
  const queryError = queryResult.error;

  if (queryError && queryError.code !== 'PGRST116') {
    return { success: false, error: `查询数据库失败: ${queryError.message}` };
  }

  if (existingRecord) {
    const currentDietLogs = (existingRecord.diet_logs as DietLogItem[]) || [];
    const updatedDietLogs = [...currentDietLogs, item];

    const updateData = {
      total_calories: (existingRecord.total_calories ?? 0) + item.calories,
      total_protein: (existingRecord.total_protein ?? 0) + item.protein,
      total_carbs: (existingRecord.total_carbs ?? 0) + item.carbs,
      total_fat: (existingRecord.total_fat ?? 0) + item.fat,
      diet_logs: updatedDietLogs,
    };

    const updateResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .update(updateData)
      .eq('id', existingRecord.id);

    if (updateResult.error) {
      return { success: false, error: `更新记录失败: ${updateResult.error.message}` };
    }

    revalidatePath('/');
    return { success: true, data: item };
  }

  const insertData: Omit<DailyStatsInsert, 'id'> = {
    user_id: userId,
    date: today,
    total_calories: item.calories,
    total_protein: item.protein,
    total_carbs: item.carbs,
    total_fat: item.fat,
    calories_burned: 0,
    diet_logs: [item] as unknown as Database['public']['Tables']['daily_stats']['Insert']['diet_logs'],
    workout_logs: [] as unknown as Database['public']['Tables']['daily_stats']['Insert']['workout_logs'],
  };

  const insertResult = await supabase
    .from('daily_stats')
    // @ts-ignore - Supabase types issue
    .insert(insertData)
    .select();

  if (insertResult.error) {
    return { success: false, error: `创建记录失败: ${insertResult.error.message}` };
  }

  revalidatePath('/');
  return { success: true, data: item };
}
