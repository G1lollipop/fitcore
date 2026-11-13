'use server';

import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { addDays, getTodayDate, weekdayIndex } from '@/lib/utils/date';
import { getUserIdOrNull } from '@/lib/auth/require-user';
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
    // formatting logic. The weekday comes from the app's calendar day (not the
    // server clock's local weekday) so it matches the `date` logs are written to.
    const result = calculateTodayWorkout(plan.structure, weekdayIndex(getTodayDate()));
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
        exerciseName: e.exerciseName,
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

const DEFAULT_GOALS: UserGoals = {
  target_calories: 2500,
  target_protein: 150,
  target_carbs: 300,
  target_fat: 80,
};

async function getUserGoals(userId: string): Promise<UserGoals> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('target_calories, target_protein, target_carbs, target_fat')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[getUserGoals] Query error:', error.message);
    return DEFAULT_GOALS;
  }

  return {
    target_calories: data?.target_calories || DEFAULT_GOALS.target_calories,
    target_protein: data?.target_protein || DEFAULT_GOALS.target_protein,
    target_carbs: data?.target_carbs || DEFAULT_GOALS.target_carbs,
    target_fat: data?.target_fat || DEFAULT_GOALS.target_fat,
  };
}

const TREND_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type TrendTotals = { intake: number; burn: number; minutes: number };

/**
 * Shape the Monday→Sunday week containing `today` into 7 trend cells.
 *
 * Everything is derived from the app's calendar day (`getTodayDate`) with pure
 * date-string arithmetic — never from the server clock's local date — so the
 * week, the `isToday` marker and the per-day keys line up with the `date`
 * column the log writes use, whatever time zone the server runs in.
 */
function buildTrend(today: string, byDate: Map<string, TrendTotals>): WeeklyTrendData {
  const todayIndex = weekdayIndex(today);
  const monday = addDays(today, -todayIndex);
  let maxKcal = 0;

  const days: WeeklyTrendDay[] = TREND_DAY_LABELS.map((label, i) => {
    const dateIso = addDays(monday, i);
    const row = byDate.get(dateIso);
    const kcalIntake = row?.intake ?? 0;
    const kcalBurn = row?.burn ?? 0;
    maxKcal = Math.max(maxKcal, kcalIntake, kcalBurn);
    return {
      dateIso,
      dayLabel: label,
      kcalIntake,
      kcalBurn,
      workoutMinutes: row?.minutes ?? 0,
      isToday: i === todayIndex,
    };
  });

  return { days, maxKcal };
}

/**
 * Pulls the current week's daily_stats in a single query and shapes it as
 * 7 ordered (monday→sunday) trend cells with intake, burn, and workout
 * minutes per day. Used by the dashboard bento weekly heat-row.
 */
async function getWeeklyTrend(userId: string): Promise<WeeklyTrendData> {
  const today = getTodayDate();
  const monday = addDays(today, -weekdayIndex(today));

  const { data, error } = await supabase
    .from('daily_stats')
    .select('date, total_calories, calories_burned, workout_duration')
    .eq('user_id', userId)
    .gte('date', monday)
    .lte('date', addDays(monday, 6));

  if (error) {
    console.error('[getWeeklyTrend] Query error:', error);
    return buildTrend(today, new Map());
  }

  const byDate = new Map<string, TrendTotals>();
  (data ?? []).forEach((row) => {
    byDate.set(row.date, {
      intake: row.total_calories ?? 0,
      burn: row.calories_burned ?? 0,
      minutes: row.workout_duration ?? 0,
    });
  });

  return buildTrend(today, byDate);
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
    getUserGoals(userId),
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
    getWeeklyTrend(userId),
    getTodayWorkoutData(userId),
  ]);

  const dailyStats = dailyStatsResult.data as DailyStatsRow | null;
  const error = dailyStatsResult.error;

  if (error && error.code !== 'PGRST116') {
    console.error('[getDashboardData] Query error:', JSON.stringify(error, null, 2));
    return null;
  }

  return {
    goals,
    today: {
      total_calories: dailyStats?.total_calories || 0,
      total_protein: dailyStats?.total_protein || 0,
      total_carbs: dailyStats?.total_carbs || 0,
      total_fat: dailyStats?.total_fat || 0,
      calories_burned: dailyStats?.calories_burned || 0,
      workout_duration: dailyStats?.workout_duration || 0,
      diet_logs: (dietLogsResult.data as DietLogItem[] | null) ?? [],
      workout_logs: (workoutLogsResult.data as WorkoutLogItem[] | null) ?? [],
    },
    weeklyTrend,
    todayWorkout,
  };
}
