'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabaseClient';
import { fetchNutritionApi } from '@/lib/ai/nutrition-client';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import { authedUserId } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats';
import type { DietLogItem } from './types';

type FoodLogInsert = Database['public']['Tables']['food_logs']['Insert'];

export type QuickLogFoodResult = {
  kind: 'food';
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type QuickLogResponse =
  | { success: true; items: QuickLogFoodResult[] }
  | { success: false; error: string };

interface ParsedSegment {
  kind: 'food';
  food_name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

async function parseQuickLog(userInput: string): Promise<ParsedSegment[]> {
  try {
    const parsed = await fetchNutritionApi(userInput);
    return [
      {
        kind: 'food' as const,
        food_name: userInput.trim() || 'Unknown food',
        calories: Math.round(Number(parsed.calories)) || 0,
        protein: Math.round(Number(parsed.protein)) || 0,
        carbs: Math.round(Number(parsed.carbs)) || 0,
        fat: Math.round(Number(parsed.fat)) || 0,
      },
    ];
  } catch (error) {
    console.error('[parseQuickLog] Nutrition API error:', error);
    return [];
  }
}

/**
 * Single-shot quick-log entrypoint for the natural-language command bar.
 *
 * Flow: 1 LLM call to classify+segment+extract food items → 1 supabase
 * round-trip to insert into today's food_logs.
 */
export async function quickLog(userInput: string): Promise<QuickLogResponse> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  const trimmed = userInput.trim();
  if (!trimmed) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const segments = await parseQuickLog(trimmed);
  if (segments.length === 0) {
    return { success: false, error: ActionError.AI_PARSE_EMPTY };
  }

  const today = getTodayDate();
  const dietLogs: DietLogItem[] = [];
  const results: QuickLogFoodResult[] = [];
  const nowIso = new Date().toISOString();

  for (const seg of segments) {
    const id = randomUUID();
    const name = seg.food_name?.trim() || 'Unknown food';
    const calories = Math.round(Number(seg.calories) || 0);
    const protein = Math.round(Number(seg.protein) || 0);
    const carbs = Math.round(Number(seg.carbs) || 0);
    const fat = Math.round(Number(seg.fat) || 0);
    dietLogs.push({ id, food_name: name, calories, protein, carbs, fat, logged_at: nowIso });
    results.push({ kind: 'food', id, name, calories, protein, carbs, fat });
  }

  // Insert the parsed food items, then recompute the daily_stats aggregate cache.
  if (dietLogs.length > 0) {
    const foodRows: FoodLogInsert[] = dietLogs.map((d) => ({
      id: d.id,
      user_id: userId,
      date: today,
      food_name: d.food_name,
      calories: d.calories,
      protein: d.protein,
      carbs: d.carbs,
      fat: d.fat,
      logged_at: d.logged_at,
    }));
    const { error } = await supabase.from('food_logs').insert(foodRows);
    if (error) {
      console.error('[quickLog] food insert error:', error.message);
      return { success: false, error: ActionError.DB_INSERT_FAILED };
    }
  }

  await recomputeDailyStats(userId, today);

  revalidatePath('/');
  return { success: true, items: results };
}
