'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import { authedUserId, getUserIdOrNull } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import { calculateTodayWorkout } from '@/lib/plans/today-workout';
import type {
  DashboardData,
  DietLogItem,
  TodayWorkoutInfo,
  UserGoals,
  WeeklyTrendData,
  WeeklyTrendDay,
  WorkoutLogItem,
} from './types';

/** Shape of the `user_settings → workout_plans` join (plan body is JSON). */
type TodaySettingsJoin = {
  current_plan_start_date: string | null;
  workout_plans: { id: string; name: string; structure: unknown } | null;
};

type DailyStatsRow = Database['public']['Tables']['daily_stats']['Row'];
type DailyStatsInsert = Database['public']['Tables']['daily_stats']['Insert'];
type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

function getWeekBounds(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getWeekLabel(date: Date): string {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDayOfWeek = firstDayOfMonth.getDay();
  const weekOfMonth = Math.ceil((date.getDate() + firstDayOfWeek) / 7);
  return `${monthNames[date.getMonth()]} Week ${weekOfMonth}`;
}

function getTodayWeekIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

async function getTodayWorkoutData(userId: string): Promise<TodayWorkoutInfo> {
  try {
    const queryResult = await supabase
      .from('user_settings')
      .select(`
        current_plan_start_date,
        workout_plans!current_plan_id (
          id,
          name,
          structure
        )
      `)
      .eq('user_id', userId)
      .single();

    const settingsWithPlan = queryResult.data as unknown as TodaySettingsJoin | null;
    const error = queryResult.error;

    if (error && error.code !== 'PGRST116') {
      console.warn('[getTodayWorkoutData] Failed to fetch user settings', { error: error.message });
    }

    if (!settingsWithPlan?.workout_plans) {
      return null;
    }

    const plan = settingsWithPlan.workout_plans;

    // Single source of truth for the (rest-day aware) day-selection + exercise
    // formatting logic — shared with my-plans.tsx.
    const result = calculateTodayWorkout(plan.structure);
    if (!result) {
      return { plan: { id: plan.id, name: plan.name }, todayDay: null, exercises: [] };
    }

    return {
      plan: {
        id: plan.id,
        name: plan.name,
      },
      todayDay: result.todayDay
        ? {
            id: `today-${result.dayIndex}`,
            name: result.isRestDay ? 'Rest day' : result.todayDay.name ?? '',
            isRestDay: result.isRestDay,
          }
        : null,
      exercises: result.exercises.map((e) => ({
        id: e.id,
        text: e.text,
        sets: e.sets ?? undefined,
        repsMin: e.repsMin ?? undefined,
        repsMax: e.repsMax ?? undefined,
        weight: e.weight ?? undefined,
      })),
    };
  } catch (error) {
    console.error('[getTodayWorkoutData] Error', { error: String(error) });
    return null;
  }
}

export async function logWater(
  amountMl: number
): Promise<{ success: boolean; newAmount?: number; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (amountMl <= 0) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

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
    console.error('[logWater] Query error:', JSON.stringify(queryError, null, 2));
    return { success: false, error: ActionError.DB_QUERY_FAILED };
  }

  if (existingRecord) {
    const newWaterIntake = (existingRecord.water_intake ?? 0) + amountMl;

    const updateResult = await supabase
      .from('daily_stats')
      .update({ water_intake: newWaterIntake })
      .eq('id', existingRecord.id);

    const updateError = updateResult.error;

    if (updateError) {
      console.error('[logWater] Update error:', JSON.stringify(updateError, null, 2));
      return { success: false, error: ActionError.DB_UPDATE_FAILED };
    }

    revalidatePath('/');
    return { success: true, newAmount: newWaterIntake };
  } else {
    const insertData: Omit<DailyStatsInsert, 'id'> = {
      user_id: userId,
      date: today,
      total_calories: 0,
      total_protein: 0,
      total_carbs: 0,
      total_fat: 0,
      calories_burned: 0,
      workout_duration: 0,
      water_intake: amountMl,
    };

    const insertResult = await supabase
      .from('daily_stats')
      .insert(insertData)
      .select();

    const insertError = insertResult.error;

    if (insertError) {
      console.error('[logWater] Insert error:', JSON.stringify(insertError, null, 2));
      return { success: false, error: ActionError.DB_INSERT_FAILED };
    }

    revalidatePath('/');
    return { success: true, newAmount: amountMl };
  }
}

export async function getUserGoals(): Promise<UserGoals | null> {
  const userId = await getUserIdOrNull();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  // PGRST116 = no rows; treat as "no settings yet" and fall through to
  // defaults. Any other error is a real failure.
  if (error && error.code !== 'PGRST116') {
    console.error('[getUserGoals] Query error:', error.message);
    return null;
  }

  const row = data as UserSettingsRow | null;
  if (!row) {
    return {
      target_calories: 2500,
      target_protein: 150,
      target_carbs: 300,
      target_fat: 80,
      water_goal: 2500,
    };
  }

  return {
    target_calories: row.target_calories || 2500,
    target_protein: row.target_protein || 150,
    target_carbs: row.target_carbs || 300,
    target_fat: row.target_fat || 80,
    water_goal: 2500,
  };
}

const TREND_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function emptyTrend(today: Date): WeeklyTrendData {
  const todayIndex = getTodayWeekIndex();
  const { start } = getWeekBounds(today);
  const days: WeeklyTrendDay[] = TREND_DAY_LABELS.map((label, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      dateIso: d.toISOString().split('T')[0],
      dayLabel: label,
      kcalIntake: 0,
      kcalBurn: 0,
      workoutMinutes: 0,
      isToday: i === todayIndex,
    };
  });
  return { days, weekLabel: getWeekLabel(today), todayIndex, maxKcal: 0 };
}

/**
 * Pulls the current week's daily_stats in a single query and shapes it as
 * 7 ordered (monday→sunday) trend cells with intake, burn, and workout
 * minutes per day. Used by the dashboard bento weekly heat-row.
 */
export async function getWeeklyTrend(): Promise<WeeklyTrendData> {
  const today = new Date();
  const userId = await getUserIdOrNull();
  if (!userId) return emptyTrend(today);

  const { start, end } = getWeekBounds(today);
  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_stats')
    .select('date, total_calories, calories_burned, workout_duration')
    .eq('user_id', userId)
    .gte('date', startStr)
    .lte('date', endStr);

  if (error) {
    console.error('[getWeeklyTrend] Query error:', error);
    return emptyTrend(today);
  }

  const byDate = new Map<string, { intake: number; burn: number; minutes: number }>();
  (data ?? []).forEach((row) => {
    byDate.set(row.date, {
      intake: row.total_calories ?? 0,
      burn: row.calories_burned ?? 0,
      minutes: row.workout_duration ?? 0,
    });
  });

  const todayIndex = getTodayWeekIndex();
  let maxKcal = 0;

  const days: WeeklyTrendDay[] = TREND_DAY_LABELS.map((label, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const row = byDate.get(iso);
    const kcalIntake = row?.intake ?? 0;
    const kcalBurn = row?.burn ?? 0;
    if (kcalIntake > maxKcal) maxKcal = kcalIntake;
    if (kcalBurn > maxKcal) maxKcal = kcalBurn;
    return {
      dateIso: iso,
      dayLabel: label,
      kcalIntake,
      kcalBurn,
      workoutMinutes: row?.minutes ?? 0,
      isToday: i === todayIndex,
    };
  });

  return { days, weekLabel: getWeekLabel(today), todayIndex, maxKcal };
}

export async function getDashboardData(): Promise<DashboardData | null> {
  const userId = await getUserIdOrNull();
  if (!userId) return null;

  const today = getTodayDate();

  const [
    goals,
    dailyStatsResult,
    dietLogsResult,
    workoutLogsResult,
    weeklyTrend,
    todayWorkout,
  ] = await Promise.all([
    getUserGoals(),
    supabase
      .from('daily_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle(),
    supabase
      .from('food_logs')
      .select('id, food_name, calories, protein, carbs, fat, logged_at')
      .eq('user_id', userId)
      .eq('date', today)
      .order('logged_at', { ascending: true }),
    supabase
      .from('workout_logs')
      .select('id, workout_name, sets, duration_minutes, calories_burned, plan_id, day_id, logged_at')
      .eq('user_id', userId)
      .eq('date', today)
      .order('logged_at', { ascending: true }),
    getWeeklyTrend(),
    getTodayWorkoutData(userId),
  ]);

  const dailyStats = dailyStatsResult.data as DailyStatsRow | null;
  const error = dailyStatsResult.error;

  if (error && error.code !== 'PGRST116') {
    console.error('[getDashboardData] Query error:', JSON.stringify(error, null, 2));
    return null;
  }

  return {
    goals: goals || {
      target_calories: 2500,
      target_protein: 150,
      target_carbs: 300,
      target_fat: 80,
      water_goal: 2500,
    },
    today: {
      total_calories: dailyStats?.total_calories || 0,
      total_protein: dailyStats?.total_protein || 0,
      total_carbs: dailyStats?.total_carbs || 0,
      total_fat: dailyStats?.total_fat || 0,
      calories_burned: dailyStats?.calories_burned || 0,
      workout_duration: dailyStats?.workout_duration || 0,
      water_intake: dailyStats?.water_intake || 0,
      diet_logs: (dietLogsResult.data as DietLogItem[] | null) ?? [],
      workout_logs: (workoutLogsResult.data as WorkoutLogItem[] | null) ?? [],
    },
    weeklyTrend,
    todayWorkout,
  };
}
