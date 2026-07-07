import 'server-only';

import { supabase } from '@/lib/supabaseClient';

/**
 * Recompute the `daily_stats` aggregate cache for a single (user, date) from
 * the normalized `food_logs` / `workout_logs` rows.
 *
 * After Phase 3, per-item logs live in their own tables and `daily_stats` is a
 * derived cache holding daily totals (used by the dashboard rings and the
 * weekly/monthly trend queries). Every food/workout write calls this so the
 * cache stays consistent. `water_intake` is owned separately by `logWater`
 * and is preserved here (never overwritten).
 */
export async function recomputeDailyStats(userId: string, date: string): Promise<void> {
  const [foodRes, workoutRes, existingRes] = await Promise.all([
    supabase
      .from('food_logs')
      .select('calories, protein, carbs, fat')
      .eq('user_id', userId)
      .eq('date', date),
    supabase
      .from('workout_logs')
      .select('calories_burned, duration_minutes')
      .eq('user_id', userId)
      .eq('date', date),
    supabase
      .from('daily_stats')
      .select('id')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle(),
  ]);

  const food = foodRes.data ?? [];
  const workout = workoutRes.data ?? [];

  const totals = food.reduce(
    (acc, f) => {
      acc.calories += f.calories ?? 0;
      acc.protein += f.protein ?? 0;
      acc.carbs += f.carbs ?? 0;
      acc.fat += f.fat ?? 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const workoutTotals = workout.reduce(
    (acc, w) => {
      acc.calories_burned += w.calories_burned ?? 0;
      acc.duration += w.duration_minutes ?? 0;
      return acc;
    },
    { calories_burned: 0, duration: 0 }
  );

  const aggregate = {
    total_calories: totals.calories,
    total_protein: totals.protein,
    total_carbs: totals.carbs,
    total_fat: totals.fat,
    calories_burned: workoutTotals.calories_burned,
    workout_duration: workoutTotals.duration,
  };

  const existing = existingRes.data;

  if (existing) {
    await supabase.from('daily_stats').update(aggregate).eq('id', existing.id);
  } else {
    await supabase.from('daily_stats').insert({
      user_id: userId,
      date,
      ...aggregate,
    });
  }
}
