'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { openai } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabaseClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import { authedUserId, getUserIdOrNull } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats';
import type { WorkoutLogItem, DailyWorkoutStatsData } from './types';

type WorkoutLogInsert = Database['public']['Tables']['workout_logs']['Insert'];

async function parseWorkoutWithAI(userInput: string): Promise<WorkoutLogItem | null> {
  try {
    const response = await openai.chat.completions.create({
      model: AI_FAST_MODEL,
      messages: [
        {
          role: 'system',
          content: `你是一个专业的运动健身助手。请根据用户输入的运动描述，准确解析出运动数据。

重要规则：
1. 识别运动名称、组数、时长和消耗的卡路里
2. 常见运动卡路里消耗参考（60kg成年人）：
   - 深蹲：每10次约8-10kcal
   - 卧推：每10次约6-8kcal
   - 硬拉：每10次约10-12kcal
   - 跑步：每分钟约10-12kcal（取决于速度）
   - 引体向上：每10次约8-10kcal
   - 俯卧撑：每10次约5-7kcal
   - 跳绳：每分钟约12-15kcal
   - 游泳：每分钟约8-10kcal
   - 骑行：每分钟约6-10kcal
3. 根据运动的组数和时长计算总消耗
4. 如果用户没有指定时长，根据组数和每组预估时间计算

返回 JSON 格式：{workout_name, sets, duration_minutes, calories_burned}
- workout_name: 运动名称（如"深蹲"、"跑步"）
- sets: 组数，整数（如4），如果没有提到组数则为null
- duration_minutes: 时长（分钟），整数
- calories_burned: 消耗卡路里（kcal），整数`,
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
      workout_name: parsed.workout_name || '未知运动',
      sets: parsed.sets ? Math.round(Number(parsed.sets)) : null,
      duration_minutes: Math.round(Number(parsed.duration_minutes)) || 0,
      calories_burned: Math.round(Number(parsed.calories_burned)) || 0,
      logged_at: new Date().toISOString(),
    };

    return result;
  } catch (error) {
    console.error('AI parsing error:', error);
    return null;
  }
}

export async function logWorkout(
  userInput: string,
  planContext?: { planId?: string; dayId?: string }
): Promise<{ success: boolean; data?: WorkoutLogItem; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!userInput) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const workoutData = await parseWorkoutWithAI(userInput);
  if (!workoutData) {
    return { success: false, error: ActionError.AI_PARSE_FAILED };
  }

  if (planContext?.planId) {
    workoutData.plan_id = planContext.planId;
  }
  if (planContext?.dayId) {
    workoutData.day_id = planContext.dayId;
  }

  const today = getTodayDate();

  const { error: insertError } = await supabase.from('workout_logs').insert({
    id: workoutData.id,
    user_id: userId,
    date: today,
    workout_name: workoutData.workout_name,
    sets: workoutData.sets,
    duration_minutes: workoutData.duration_minutes,
    calories_burned: workoutData.calories_burned,
    plan_id: workoutData.plan_id ?? null,
    day_id: workoutData.day_id ?? null,
    logged_at: workoutData.logged_at,
  });

  if (insertError) {
    console.error('[logWorkout] Insert error:', insertError.message);
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  await recomputeDailyStats(userId, today);

  revalidatePath('/');
  return { success: true, data: workoutData };
}

export async function getDailyWorkoutStats(): Promise<DailyWorkoutStatsData | null> {
  const userId = await getUserIdOrNull();
  if (!userId) return null;

  const today = getTodayDate();

  const [statsRes, logsRes] = await Promise.all([
    supabase
      .from('daily_stats')
      .select('calories_burned, workout_duration, water_intake')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle(),
    supabase
      .from('workout_logs')
      .select('id, workout_name, sets, duration_minutes, calories_burned, plan_id, day_id, logged_at')
      .eq('user_id', userId)
      .eq('date', today)
      .order('logged_at', { ascending: true }),
  ]);

  if (statsRes.error && statsRes.error.code !== 'PGRST116') {
    console.error('[getDailyWorkoutStats] Query error:', statsRes.error.message);
    return null;
  }

  const row = statsRes.data;
  const workoutLogs = (logsRes.data as WorkoutLogItem[] | null) ?? [];

  if (!row && workoutLogs.length === 0) {
    return null;
  }

  return {
    calories_burned: row?.calories_burned || 0,
    workout_duration: row?.workout_duration || 0,
    water_intake: row?.water_intake || 0,
    workout_logs: workoutLogs,
  };
}

export async function deleteWorkoutLog(
  logId: string
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!logId) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('workout_logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', userId)
    .select('id, date');

  if (deleteError) {
    console.error('[deleteWorkoutLog] Delete error:', deleteError.message);
    return { success: false, error: ActionError.DB_DELETE_FAILED };
  }

  if (!deleted || deleted.length === 0) {
    return { success: false, error: ActionError.RECORD_NOT_FOUND };
  }

  await recomputeDailyStats(userId, deleted[0].date);

  revalidatePath('/');
  return { success: true };
}

export async function batchLogWorkouts(
  workouts: Array<{ name: string; sets?: number | null; duration_minutes?: number; calories_burned?: number }>
): Promise<{ success: boolean; count?: number; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  if (!workouts || workouts.length === 0) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const today = getTodayDate();
  const now = new Date().toISOString();

  const rows: WorkoutLogInsert[] = workouts.map((w) => ({
    id: randomUUID(),
    user_id: userId,
    date: today,
    workout_name: w.name,
    sets: w.sets ?? null,
    duration_minutes: w.duration_minutes || 0,
    calories_burned: w.calories_burned || 0,
    logged_at: now,
  }));

  const { error: insertError } = await supabase.from('workout_logs').insert(rows);

  if (insertError) {
    console.error('[batchLogWorkouts] Insert error:', insertError.message);
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  await recomputeDailyStats(userId, today);

  revalidatePath('/');
  return { success: true, count: rows.length };
}
