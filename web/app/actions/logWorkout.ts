'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { openai } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabaseClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import type { WorkoutLogItem, DailyWorkoutStatsData } from './types';

type DailyStatsRow = Database['public']['Tables']['daily_stats']['Row'];
type DailyStatsInsert = Database['public']['Tables']['daily_stats']['Insert'];

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

    console.log('[AI Response] 原始返回:', content);

    const parsed = JSON.parse(content);
    const result = {
      id: randomUUID(),
      workout_name: parsed.workout_name || '未知运动',
      sets: parsed.sets ? Math.round(Number(parsed.sets)) : null,
      duration_minutes: Math.round(Number(parsed.duration_minutes)) || 0,
      calories_burned: Math.round(Number(parsed.calories_burned)) || 0,
      logged_at: new Date().toISOString(),
    };

    console.log('[AI Response] 解析结果:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('AI parsing error:', error);
    return null;
  }
}

export async function logWorkout(
  userInput: string,
  userId: string,
  planContext?: { planId?: string; dayId?: string }
): Promise<{ success: boolean; data?: WorkoutLogItem; error?: string }> {
  if (!userInput || !userId) {
    return { success: false, error: '缺少必要参数' };
  }

  const workoutData = await parseWorkoutWithAI(userInput);
  if (!workoutData) {
    return { success: false, error: 'AI 解析失败，请检查 OPENAI_API_KEY 配置' };
  }

  if (planContext?.planId) {
    workoutData.plan_id = planContext.planId;
  }
  if (planContext?.dayId) {
    workoutData.day_id = planContext.dayId;
  }

  const today = getTodayDate();

  console.log('[logWorkout] Querying daily_stats for user:', userId, 'date:', today);

  const queryResult = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const existingRecord = queryResult.data as DailyStatsRow | null;
  const queryError = queryResult.error;

  if (queryError && queryError.code !== 'PGRST116') {
    console.error('[logWorkout] Query error:', JSON.stringify(queryError, null, 2));
    return { success: false, error: `查询数据库失败: ${queryError.message}` };
  }

  if (existingRecord) {
    const currentWorkoutLogs = (existingRecord.workout_logs as WorkoutLogItem[]) || [];
    const updatedWorkoutLogs = [...currentWorkoutLogs, workoutData];

    const newCaloriesBurned = (existingRecord.calories_burned ?? 0) + workoutData.calories_burned;
    const newWorkoutDuration = (existingRecord.workout_duration ?? 0) + workoutData.duration_minutes;

    const updateData = {
      calories_burned: newCaloriesBurned,
      workout_duration: newWorkoutDuration,
      workout_logs: updatedWorkoutLogs,
    };

    console.log('[logWorkout] Updating existing record:', existingRecord.id);

    const updateResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .update(updateData)
      .eq('id', existingRecord.id);

    const updateError = updateResult.error;

    if (updateError) {
      console.error('[logWorkout] Update error:', JSON.stringify(updateError, null, 2));
      return { success: false, error: `更新记录失败: ${updateError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: workoutData };
  } else {
    const insertData: Omit<DailyStatsInsert, 'id'> = {
      user_id: userId,
      date: today,
      total_calories: 0,
      total_protein: 0,
      total_carbs: 0,
      total_fat: 0,
      calories_burned: workoutData.calories_burned,
      workout_duration: workoutData.duration_minutes,
      diet_logs: [] as unknown as Database['public']['Tables']['daily_stats']['Insert']['diet_logs'],
      workout_logs: [workoutData] as unknown as Database['public']['Tables']['daily_stats']['Insert']['workout_logs'],
    };

    console.log('[logWorkout] Inserting new record:', JSON.stringify(insertData, null, 2));

    const insertResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .insert(insertData)
      .select();

    const insertError = insertResult.error;
    const insertedData = insertResult.data;

    if (insertError) {
      console.error('[logWorkout] Insert error:', JSON.stringify(insertError, null, 2));
      return { success: false, error: `创建记录失败: ${insertError.message}` };
    }

    console.log('[logWorkout] Insert success:', insertedData);

    revalidatePath('/');
    return { success: true, data: workoutData };
  }
}

export async function getDailyWorkoutStats(userId: string): Promise<DailyWorkoutStatsData | null> {
  if (!userId) return null;

  const today = getTodayDate();
  console.log('[getDailyWorkoutStats] Querying for user:', userId, 'date:', today);

  const { data, error } = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single() as { data: DailyStatsRow | null; error: null };

  if (error) {
    console.log('[getDailyWorkoutStats] Query error:', JSON.stringify(error, null, 2));
    return null;
  }

  if (!data) {
    console.log('[getDailyWorkoutStats] No data found');
    return null;
  }

  console.log('[getDailyWorkoutStats] Found data:', JSON.stringify(data, null, 2));

  return {
    calories_burned: data.calories_burned || 0,
    workout_duration: data.workout_duration || 0,
    water_intake: data.water_intake || 0,
    workout_logs: (data.workout_logs as WorkoutLogItem[]) || [],
  };
}

export async function deleteWorkoutLog(
  userId: string,
  logId: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !logId) {
    return { success: false, error: '缺少必要参数' };
  }

  const today = getTodayDate();
  console.log('[deleteWorkoutLog] Deleting log with id:', logId, 'for user:', userId);

  const queryResult = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const existingRecord = queryResult.data as DailyStatsRow | null;
  const queryError = queryResult.error;

  if (queryError || !existingRecord) {
    return { success: false, error: '未找到今日记录' };
  }

  const currentWorkoutLogs = (existingRecord.workout_logs as WorkoutLogItem[]) || [];
  const targetLog = currentWorkoutLogs.find((log) => log.id === logId);

  if (!targetLog) {
    return { success: false, error: '未找到该记录' };
  }

  const updatedWorkoutLogs = currentWorkoutLogs.filter((log) => log.id !== logId);

  const newCaloriesBurned = Math.max(0, (existingRecord.calories_burned ?? 0) - (targetLog.calories_burned || 0));
  const newWorkoutDuration = Math.max(0, (existingRecord.workout_duration ?? 0) - (targetLog.duration_minutes || 0));

  const updateData = {
    calories_burned: newCaloriesBurned,
    workout_duration: newWorkoutDuration,
    workout_logs: updatedWorkoutLogs,
  };

  const updateResult = await supabase
    .from('daily_stats')
    // @ts-ignore - Supabase types issue
    .update(updateData)
    .eq('id', existingRecord.id);

  if (updateResult.error) {
    console.error('[deleteWorkoutLog] Update error:', updateResult.error);
    return { success: false, error: `删除记录失败: ${updateResult.error.message}` };
  }

  revalidatePath('/');
  return { success: true };
}

export async function batchLogWorkouts(
  userId: string,
  workouts: Array<{ name: string; sets?: number | null; duration_minutes?: number; calories_burned?: number }>
): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!userId || !workouts || workouts.length === 0) {
    return { success: false, error: '缺少必要参数' };
  }

  const today = getTodayDate();
  console.log('[batchLogWorkouts] Batch logging', workouts.length, 'workouts for user:', userId);

  const queryResult = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const existingRecord = queryResult.data as DailyStatsRow | null;
  const queryError = queryResult.error;

  if (queryError && queryError.code !== 'PGRST116') {
    console.error('[batchLogWorkouts] Query error:', JSON.stringify(queryError, null, 2));
    return { success: false, error: `查询数据库失败: ${queryError.message}` };
  }

  const now = new Date().toISOString();
  const newWorkoutLogs: WorkoutLogItem[] = workouts.map(w => ({
    id: randomUUID(),
    workout_name: w.name,
    sets: w.sets || null,
    duration_minutes: w.duration_minutes || 0,
    calories_burned: w.calories_burned || 0,
    logged_at: now,
  }));

  let totalCalories = 0;
  let totalDuration = 0;
  newWorkoutLogs.forEach(w => {
    totalCalories += w.calories_burned;
    totalDuration += w.duration_minutes;
  });

  if (existingRecord) {
    const currentWorkoutLogs = (existingRecord.workout_logs as WorkoutLogItem[]) || [];
    const updatedWorkoutLogs = [...currentWorkoutLogs, ...newWorkoutLogs];

    const newCaloriesBurned = (existingRecord.calories_burned ?? 0) + totalCalories;
    const newWorkoutDuration = (existingRecord.workout_duration ?? 0) + totalDuration;

    const updateData = {
      calories_burned: newCaloriesBurned,
      workout_duration: newWorkoutDuration,
      workout_logs: updatedWorkoutLogs,
    };

    const updateResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .update(updateData)
      .eq('id', existingRecord.id);

    if (updateResult.error) {
      console.error('[batchLogWorkouts] Update error:', JSON.stringify(updateResult.error, null, 2));
      return { success: false, error: `更新记录失败: ${updateResult.error.message}` };
    }

    revalidatePath('/');
    return { success: true, count: newWorkoutLogs.length };
  } else {
    const insertData: Omit<DailyStatsInsert, 'id'> = {
      user_id: userId,
      date: today,
      total_calories: 0,
      total_protein: 0,
      total_carbs: 0,
      total_fat: 0,
      calories_burned: totalCalories,
      workout_duration: totalDuration,
      diet_logs: [] as unknown as Database['public']['Tables']['daily_stats']['Insert']['diet_logs'],
      workout_logs: newWorkoutLogs as unknown as Database['public']['Tables']['daily_stats']['Insert']['workout_logs'],
    };

    const insertResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .insert(insertData)
      .select();

    if (insertResult.error) {
      console.error('[batchLogWorkouts] Insert error:', JSON.stringify(insertResult.error, null, 2));
      return { success: false, error: `创建记录失败: ${insertResult.error.message}` };
    }

    revalidatePath('/');
    return { success: true, count: newWorkoutLogs.length };
  }
}
