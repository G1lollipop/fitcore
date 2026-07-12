'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabaseClient';
import { fetchNutritionApi } from '@/lib/ai/nutrition-client';
import { getTodayDate, resolveLogTimestamp } from '@/lib/utils/date';
import { authedUserId, getUserIdOrNull } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats';
import type { DietLogItem } from './types';

async function parseFoodWithAI(userInput: string): Promise<DietLogItem | null> {
  try {
    const parsed = await fetchNutritionApi(userInput);
    return {
      id: randomUUID(),
      food_name: userInput.trim() || 'Unknown food',
      calories: Math.round(Number(parsed.calories)) || 0,
      protein: Math.round(Number(parsed.protein)) || 0,
      carbs: Math.round(Number(parsed.carbs)) || 0,
      fat: Math.round(Number(parsed.fat)) || 0,
      logged_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[parseFoodWithAI] Nutrition API error:', error);
    return null;
  }
}

export async function logFood(
  userInput: string,
  dateStr?: string
): Promise<{ success: boolean; data?: DietLogItem; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!userInput) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const foodData = await parseFoodWithAI(userInput);
  if (!foodData) {
    return { success: false, error: ActionError.AI_PARSE_FAILED };
  }

  // Allow back-dated entries (historical-day editing); defaults to today.
  const { date, loggedAt } = resolveLogTimestamp(dateStr);
  foodData.logged_at = loggedAt;

  const { error: insertError } = await supabase.from('food_logs').insert({
    id: foodData.id,
    user_id: userId,
    date,
    food_name: foodData.food_name,
    calories: foodData.calories,
    protein: foodData.protein,
    carbs: foodData.carbs,
    fat: foodData.fat,
    logged_at: foodData.logged_at,
  });

  if (insertError) {
    console.error('[logFood] Insert error:', insertError.message);
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  await recomputeDailyStats(userId, date);

  revalidatePath('/');
  return { success: true, data: foodData };
}

export async function deleteDietLog(
  logId: string
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!logId) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('food_logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId)
    .select('id, date');

  if (deleteError) {
    console.error('[deleteDietLog] Delete error:', deleteError.message);
    return { success: false, error: ActionError.DB_DELETE_FAILED };
  }

  if (!deleted || deleted.length === 0) {
    return { success: false, error: ActionError.RECORD_NOT_FOUND };
  }

  await recomputeDailyStats(userId, deleted[0].date);

  revalidatePath('/');
  return { success: true };
}
