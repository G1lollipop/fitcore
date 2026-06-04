'use server';

import { revalidatePath } from 'next/cache';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import type {
  DashboardData,
  DietLogItem,
  UserGoals,
  WeeklyActivityData,
  WeeklyTrendData,
  WeeklyTrendDay,
  WeeklyWorkoutStats,
  WorkoutLogItem,
  YesterdayWorkoutLog,
} from './types';

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
  const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDayOfWeek = firstDayOfMonth.getDay();
  const weekOfMonth = Math.ceil((date.getDate() + firstDayOfWeek) / 7);
  return `${monthNames[date.getMonth()]}第${weekOfMonth}周`;
}

function getTodayWeekIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

export type TodayWorkoutInfo = {
  plan: { id: string; name: string } | null;
  todayDay: { id: string; name: string; isRestDay: boolean } | null;
  exercises: { id: string; text: string; sets?: number; repsMin?: number; repsMax?: number; weight?: number }[];
} | null;

async function getTodayWorkoutData(userId: string): Promise<TodayWorkoutInfo> {
  try {
    const { data: settingsWithPlan, error } = await (supabase as any)
      .from('user_settings')
      .select(`
        current_plan_start_date,
        workout_plans!current_plan_id (
          id,
          name,
          frequency_per_week,
          rest_days,
          workout_days (
            id,
            name,
            day_order,
            day_type,
            rest_day,
            focus_muscles,
            estimated_duration_minutes,
            plan_exercises (
              id,
              target_sets,
              target_reps_min,
              target_reps_max,
              target_weight_kg,
              exercises (
                id,
                name,
                category
              )
            )
          )
        )
      `)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('[getTodayWorkoutData] 获取用户设置失败', { error: error.message });
    }

    if (!settingsWithPlan?.workout_plans) {
      return null;
    }

    const plan = settingsWithPlan.workout_plans;
    const days = plan.workout_days || [];
    
    if (days.length === 0) {
      return { plan, todayDay: null, exercises: [] };
    }

    const today = new Date();
    const dayOfWeek = today.getDay();
    const todayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const restDays: number[] = (plan as any).rest_days || [];
    
    const sortedDays = [...days].sort((a: any, b: any) => (a.day_order || 0) - (b.day_order || 0));
    
    let todayDay: any = null;
    let isRestDay = false;
    
    if (restDays.length > 0 && restDays.includes(todayIndex + 1)) {
      isRestDay = true;
      if (sortedDays.length > 0) {
        todayDay = {
          ...sortedDays[0],
          name: '休息日',
        };
      }
    } else {
      if (restDays.length > 0) {
        let adjustedIndex = 0;
        let dayCount = 0;
        
        for (let i = 0; i <= todayIndex; i++) {
          if (!restDays.includes(i + 1)) {
            dayCount++;
          }
        }
        
        adjustedIndex = (dayCount - 1) % sortedDays.length;
        if (adjustedIndex < 0) adjustedIndex = 0;
        
        todayDay = sortedDays[adjustedIndex] || sortedDays[0];
      } else {
        todayDay = sortedDays.find((d: any) => d.day_order === todayIndex + 1) || sortedDays[todayIndex % sortedDays.length];
      }
    }

    if (!todayDay) {
      todayDay = sortedDays[0];
    }

    const exercises = (todayDay?.plan_exercises || []).map((pe: any) => {
      const sets = pe.target_sets || 0;
      const repsMin = pe.target_reps_min;
      const repsMax = pe.target_reps_max;
      const weight = pe.target_weight_kg;
      
      let exerciseText = pe.exercises?.name || '未知动作';
      if (sets > 0) {
        exerciseText += ` ${sets}组`;
        if (repsMin && repsMax) {
          exerciseText += ` ${repsMin}-${repsMax}次`;
        } else if (repsMin) {
          exerciseText += ` ${repsMin}次`;
        }
        if (weight) {
          exerciseText += ` ${weight}kg`;
        }
      }
      
      return {
        id: pe.id,
        text: exerciseText,
        exerciseId: pe.exercises?.id,
        exerciseName: pe.exercises?.name,
        sets: pe.target_sets,
        repsMin: pe.target_reps_min,
        repsMax: pe.target_reps_max,
        weight: pe.target_weight_kg,
      };
    });

    return {
      plan: {
        id: plan.id,
        name: plan.name,
      },
      todayDay: {
        id: todayDay?.id,
        name: isRestDay ? '休息日' : todayDay?.name,
        isRestDay,
      },
      exercises: isRestDay ? [] : exercises,
    };
  } catch (error) {
    console.error('[getTodayWorkoutData] 异常', { error: String(error) });
    return null;
  }
}

export async function logWater(
  userId: string,
  amountMl: number
): Promise<{ success: boolean; newAmount?: number; error?: string }> {
  if (!userId || amountMl <= 0) {
    return { success: false, error: '缺少必要参数' };
  }

  const today = getTodayDate();

  console.log('[logWater] Querying daily_stats for user:', userId, 'date:', today);

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
    return { success: false, error: `查询数据库失败: ${queryError.message}` };
  }

  if (existingRecord) {
    const newWaterIntake = (existingRecord.water_intake ?? 0) + amountMl;

    const updateResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .update({ water_intake: newWaterIntake })
      .eq('id', existingRecord.id);

    const updateError = updateResult.error;

    if (updateError) {
      console.error('[logWater] Update error:', JSON.stringify(updateError, null, 2));
      return { success: false, error: `更新记录失败: ${updateError.message}` };
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
      diet_logs: [],
      workout_logs: [],
    };

    console.log('[logWater] Inserting new record:', JSON.stringify(insertData, null, 2));

    const insertResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .insert(insertData)
      .select();

    const insertError = insertResult.error;

    if (insertError) {
      console.error('[logWater] Insert error:', JSON.stringify(insertError, null, 2));
      return { success: false, error: `创建记录失败: ${insertError.message}` };
    }

    revalidatePath('/');
    return { success: true, newAmount: amountMl };
  }
}

export async function getUserGoals(userId: string): Promise<UserGoals | null> {
  if (!userId) return null;

  console.log('[getUserGoals] Querying for user:', userId);

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single() as { data: UserSettingsRow | null; error: null };

  if (error) {
    console.log('[getUserGoals] Query error:', JSON.stringify(error, null, 2));
    return null;
  }

  if (!data) {
    console.log('[getUserGoals] No data found, returning defaults');
    return {
      target_calories: 2500,
      target_protein: 150,
      target_carbs: 300,
      target_fat: 80,
      water_goal: 2500,
    };
  }

  return {
    target_calories: data.target_calories || 2500,
    target_protein: data.target_protein || 150,
    target_carbs: data.target_carbs || 300,
    target_fat: data.target_fat || 80,
    water_goal: 2500,
  };
}

export async function getWeeklyActivity(userId: string): Promise<WeeklyActivityData> {
  if (!userId) {
    return {
      values: [0, 0, 0, 0, 0, 0, 0],
      weekLabel: getWeekLabel(new Date()),
      todayIndex: getTodayWeekIndex(),
    };
  }

  const today = new Date();
  const { start, end } = getWeekBounds(today);
  const todayIndex = getTodayWeekIndex();

  const startDateStr = start.toISOString().split('T')[0];
  const endDateStr = end.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_stats')
    .select('date, workout_duration')
    .eq('user_id', userId)
    .gte('date', startDateStr)
    .lte('date', endDateStr);

  if (error) {
    console.error('[getWeeklyActivity] Query error:', error);
    return {
      values: [0, 0, 0, 0, 0, 0, 0],
      weekLabel: getWeekLabel(today),
      todayIndex,
    };
  }

  const values: number[] = [0, 0, 0, 0, 0, 0, 0];

  if (data) {
    data.forEach((row) => {
      const rowDate = new Date(row.date + 'T00:00:00');
      const dayOfWeek = rowDate.getDay();
      const index = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const duration = row.workout_duration || 0;
      if (duration > 0) {
        const activityPercent = Math.min(100, Math.round((duration / 60) * 20));
        values[index] = activityPercent;
      }
    });
  }

  return {
    values,
    weekLabel: getWeekLabel(today),
    todayIndex,
  };
}

const TREND_DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

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
export async function getWeeklyTrend(userId: string): Promise<WeeklyTrendData> {
  const today = new Date();
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

export async function getWeeklyWorkoutStats(userId: string): Promise<WeeklyWorkoutStats> {
  const defaultResult: WeeklyWorkoutStats = {
    daysThisWeek: 0,
    daysLastWeek: 0,
    change: 0,
  };

  if (!userId) return defaultResult;

  const today = new Date();
  const thisWeekBounds = getWeekBounds(today);
  const lastWeekStart = new Date(thisWeekBounds.start);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekBounds.end);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

  const thisWeekStartStr = thisWeekBounds.start.toISOString().split('T')[0];
  const thisWeekEndStr = thisWeekBounds.end.toISOString().split('T')[0];
  const lastWeekStartStr = lastWeekStart.toISOString().split('T')[0];
  const lastWeekEndStr = lastWeekEnd.toISOString().split('T')[0];

  const [thisWeekResult, lastWeekResult] = await Promise.all([
    supabase
      .from('daily_stats')
      .select('date')
      .eq('user_id', userId)
      .gte('date', thisWeekStartStr)
      .lte('date', thisWeekEndStr)
      .gt('workout_duration', 0),
    supabase
      .from('daily_stats')
      .select('date')
      .eq('user_id', userId)
      .gte('date', lastWeekStartStr)
      .lte('date', lastWeekEndStr)
      .gt('workout_duration', 0),
  ]);

  const daysThisWeek = thisWeekResult.data?.length || 0;
  const daysLastWeek = lastWeekResult.data?.length || 0;

  return {
    daysThisWeek,
    daysLastWeek,
    change: daysThisWeek - daysLastWeek,
  };
}

export async function getYesterdayWorkout(userId: string): Promise<YesterdayWorkoutLog> {
  if (!userId) return [];

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_stats')
    .select('workout_logs')
    .eq('user_id', userId)
    .eq('date', yesterdayStr)
    .single();

  if (error || !data?.workout_logs) {
    return [];
  }

  const logs = data.workout_logs as Array<{ workout_name?: string; text?: string }>;
  return logs.map((log) => ({
    text: log.workout_name || log.text || '',
  }));
}

export async function getDashboardData(userId: string): Promise<DashboardData | null> {
  if (!userId) return null;

  const today = getTodayDate();

  const [goals, dailyStatsResult, weeklyActivity, weeklyTrend, weeklyWorkoutStats, yesterdayWorkout, todayWorkout] = await Promise.all([
    getUserGoals(userId),
    supabase
      .from('daily_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .single(),
    getWeeklyActivity(userId),
    getWeeklyTrend(userId),
    getWeeklyWorkoutStats(userId),
    getYesterdayWorkout(userId),
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
      // Supabase JSONB columns are typed as `Json` (a recursive union); we
      // control what gets written into these columns from logFood/logWorkout,
      // so it's safe to assert the documented shape here.
      diet_logs: (dailyStats?.diet_logs as DietLogItem[] | null) ?? [],
      workout_logs: (dailyStats?.workout_logs as WorkoutLogItem[] | null) ?? [],
    },
    weeklyActivity,
    weeklyTrend,
    weeklyWorkoutStats,
    yesterdayWorkout,
    todayWorkout,
  };
}
