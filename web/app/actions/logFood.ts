'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { openai } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabaseClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';
import { getTodayDate } from '@/lib/utils/date';
import { authedUserId, getUserIdOrNull } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats';
import type { DietLogItem, DailyStatsData } from './types';

async function parseFoodWithAI(userInput: string): Promise<DietLogItem | null> {
  try {
    const response = await openai.chat.completions.create({
      model: AI_FAST_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a professional nutritionist assistant. Based on the food the user describes, accurately compute its nutritional content.

Key rules:
1. Pay attention to the food's weight/portion and compute nutrition from the actual amount.
2. Keep the specifics from the user's input in the food name (e.g. "30g whey protein", not just "whey protein").
3. Reference values for common foods:
   - Whey protein: ~70-80g protein per 100g, ~350-400 kcal
   - Chicken breast: ~31g protein per 100g, ~165 kcal
   - Cooked rice: ~28g carbs per 100g, ~130 kcal
   - Egg: ~6g protein each, ~70 kcal
4. Scale proportionally to the weight the user specifies.

Return JSON: {food_name, calories, protein, carbs, fat}
- food_name: keep the user's food description (e.g. "30g whey protein")
- calories: total calories (kcal), integer
- protein: protein (g), integer
- carbs: carbohydrates (g), integer
- fat: fat (g), integer`,
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
      food_name: parsed.food_name || 'Unknown food',
      calories: Math.round(Number(parsed.calories)) || 0,
      protein: Math.round(Number(parsed.protein)) || 0,
      carbs: Math.round(Number(parsed.carbs)) || 0,
      fat: Math.round(Number(parsed.fat)) || 0,
      logged_at: new Date().toISOString(),
    };

    return result;
  } catch (error) {
    console.error('AI parsing error:', error);
    return null;
  }
}

export async function logFood(
  userInput: string
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

  const today = getTodayDate();

  const { error: insertError } = await supabase.from('food_logs').insert({
    id: foodData.id,
    user_id: userId,
    date: today,
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

  await recomputeDailyStats(userId, today);

  revalidatePath('/');
  return { success: true, data: foodData };
}

export async function getDailyStats(): Promise<DailyStatsData | null> {
  const userId = await getUserIdOrNull();
  if (!userId) return null;

  const today = getTodayDate();

  const [statsRes, logsRes] = await Promise.all([
    supabase
      .from('daily_stats')
      .select('total_calories, total_protein, total_carbs, total_fat')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle(),
    supabase
      .from('food_logs')
      .select('id, food_name, calories, protein, carbs, fat, logged_at')
      .eq('user_id', userId)
      .eq('date', today)
      .order('logged_at', { ascending: true }),
  ]);

  if (statsRes.error && statsRes.error.code !== 'PGRST116') {
    console.error('[getDailyStats] Query error:', statsRes.error.message);
    return null;
  }

  const row = statsRes.data;
  const dietLogs = (logsRes.data as DietLogItem[] | null) ?? [];

  if (!row && dietLogs.length === 0) {
    return null;
  }

  return {
    total_calories: row?.total_calories || 0,
    total_protein: row?.total_protein || 0,
    total_carbs: row?.total_carbs || 0,
    total_fat: row?.total_fat || 0,
    diet_logs: dietLogs,
  };
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
