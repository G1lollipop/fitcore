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
          content: `你是一个专业的营养师助手。请根据用户输入的食物，准确计算其营养成分。

重要规则：
1. 注意食物的重量/分量，根据实际重量计算营养成分
2. 食物名称要保留用户输入的具体信息（如"30g蛋白粉"而不是"蛋白粉"）
3. 常见食物营养成分参考：
   - 蛋白粉：每100g约含蛋白质70-80g，热量约350-400kcal
   - 鸡胸肉：每100g约含蛋白质31g，热量约165kcal
   - 米饭：每100g约含碳水28g，热量约130kcal
   - 鸡蛋：每个约含蛋白质6g，热量约70kcal
4. 根据用户指定的重量按比例计算

返回 JSON 格式：{food_name, calories, protein, carbs, fat}
- food_name: 保留用户输入的食物描述（如"30g蛋白粉"）
- calories: 总热量(kcal)，整数
- protein: 蛋白质含量(g)，整数
- carbs: 碳水化合物含量(g)，整数
- fat: 脂肪含量(g)，整数`,
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
      food_name: parsed.food_name || '未知食物',
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
