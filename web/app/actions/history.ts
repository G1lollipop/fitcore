'use server';

import { supabase } from '@/lib/supabaseClient';
import { getUserIdOrNull } from '@/lib/auth/require-user';
import type { DietLogItem, WorkoutLogItem } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_GOALS = { calories: 2500, protein: 150, carbs: 300, fat: 80 } as const;

export interface NutritionDayData {
  goals: { calories: number; protein: number; carbs: number; fat: number };
  dietLogs: DietLogItem[];
}

/**
 * Diet logs + macro goals for an arbitrary date, scoped to the signed-in user.
 *
 * Replaces the previous client-side direct Supabase reads in
 * `nutrition-center.tsx`: with the anon key removed from the browser, all data
 * access flows through here so the server can enforce ownership.
 */
export async function getNutritionByDate(dateStr: string): Promise<NutritionDayData> {
  const userId = await getUserIdOrNull();
  if (!userId || !DATE_RE.test(dateStr)) {
    return { goals: { ...DEFAULT_GOALS }, dietLogs: [] };
  }

  const [settingsRes, logsRes] = await Promise.all([
    supabase
      .from('user_settings')
      .select('target_calories, target_protein, target_carbs, target_fat')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('food_logs')
      .select('id, food_name, calories, protein, carbs, fat, logged_at')
      .eq('user_id', userId)
      .eq('date', dateStr)
      .order('logged_at', { ascending: true }),
  ]);

  const settings = settingsRes.data;
  const goals = {
    calories: settings?.target_calories || DEFAULT_GOALS.calories,
    protein: settings?.target_protein || DEFAULT_GOALS.protein,
    carbs: settings?.target_carbs || DEFAULT_GOALS.carbs,
    fat: settings?.target_fat || DEFAULT_GOALS.fat,
  };

  const dietLogs = (logsRes.data as DietLogItem[] | null) ?? [];

  return { goals, dietLogs };
}

/**
 * Workout logs grouped by date over an inclusive [start, end] range, scoped to
 * the signed-in user. Replaces the client-side direct read in
 * `training-history.tsx`.
 */
export async function getWorkoutHistory(
  startStr: string,
  endStr: string
): Promise<Record<string, WorkoutLogItem[]>> {
  const userId = await getUserIdOrNull();
  if (!userId || !DATE_RE.test(startStr) || !DATE_RE.test(endStr)) {
    return {};
  }

  const { data, error } = await supabase
    .from('workout_logs')
    .select('id, date, workout_name, sets, duration_minutes, calories_burned, plan_id, day_id, logged_at')
    .eq('user_id', userId)
    .gte('date', startStr)
    .lte('date', endStr)
    .order('logged_at', { ascending: true });

  if (error) {
    console.error('[getWorkoutHistory] Query failed:', error.message);
    return {};
  }

  const grouped: Record<string, WorkoutLogItem[]> = {};
  for (const row of data ?? []) {
    const { date, ...log } = row;
    if (!date) continue;
    (grouped[date] ??= []).push(log as WorkoutLogItem);
  }

  return grouped;
}
