'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { openai } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabaseClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import type { DietLogItem, DailyStatsData } from './types';

type DailyStatsRow = Database['public']['Tables']['daily_stats']['Row'];
type DailyStatsInsert = Database['public']['Tables']['daily_stats']['Insert'];

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

    console.log('[AI Response] 原始返回:', content);

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

    console.log('[AI Response] 解析结果:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('AI parsing error:', error);
    return null;
  }
}

export async function logFood(
  userInput: string,
  userId: string
): Promise<{ success: boolean; data?: DietLogItem; error?: string }> {
  if (!userInput || !userId) {
    return { success: false, error: '缺少必要参数' };
  }

  const foodData = await parseFoodWithAI(userInput);
  if (!foodData) {
    return { success: false, error: 'AI 解析失败，请检查 OPENAI_API_KEY 配置' };
  }

  const today = getTodayDate();

  console.log('[logFood] Querying daily_stats for user:', userId, 'date:', today);

  const queryResult = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const existingRecord = queryResult.data as DailyStatsRow | null;
  const queryError = queryResult.error;

  if (queryError && queryError.code !== 'PGRST116') {
    console.error('[logFood] Query error:', JSON.stringify(queryError, null, 2));
    return { success: false, error: `查询数据库失败: ${queryError.message}` };
  }

  if (existingRecord) {
    const currentDietLogs = (existingRecord.diet_logs as DietLogItem[]) || [];
    const updatedDietLogs = [...currentDietLogs, foodData];

    const newTotalCalories = (existingRecord.total_calories ?? 0) + foodData.calories;
    const newTotalProtein = (existingRecord.total_protein ?? 0) + foodData.protein;
    const newTotalCarbs = (existingRecord.total_carbs ?? 0) + foodData.carbs;
    const newTotalFat = (existingRecord.total_fat ?? 0) + foodData.fat;

    const updateData = {
      total_calories: newTotalCalories,
      total_protein: newTotalProtein,
      total_carbs: newTotalCarbs,
      total_fat: newTotalFat,
      diet_logs: updatedDietLogs,
    };

    console.log('[logFood] Updating existing record:', existingRecord.id);

    const updateResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .update(updateData)
      .eq('id', existingRecord.id);

    const updateError = updateResult.error;

    if (updateError) {
      console.error('[logFood] Update error:', JSON.stringify(updateError, null, 2));
      return { success: false, error: `更新记录失败: ${updateError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: foodData };
  } else {
    const insertData: Omit<DailyStatsInsert, 'id'> = {
      user_id: userId,
      date: today,
      total_calories: foodData.calories,
      total_protein: foodData.protein,
      total_carbs: foodData.carbs,
      total_fat: foodData.fat,
      calories_burned: 0,
      diet_logs: [foodData] as unknown as Database['public']['Tables']['daily_stats']['Insert']['diet_logs'],
      workout_logs: [] as unknown as Database['public']['Tables']['daily_stats']['Insert']['workout_logs'],
    };

    console.log('[logFood] Inserting new record:', JSON.stringify(insertData, null, 2));

    const insertResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .insert(insertData)
      .select();

    const insertError = insertResult.error;
    const insertedData = insertResult.data;

    if (insertError) {
      console.error('[logFood] Insert error:', JSON.stringify(insertError, null, 2));
      return { success: false, error: `创建记录失败: ${insertError.message}` };
    }

    console.log('[logFood] Insert success:', insertedData);

    revalidatePath('/');
    return { success: true, data: foodData };
  }
}

export async function getDailyStats(userId: string): Promise<DailyStatsData | null> {
  if (!userId) return null;

  const today = getTodayDate();
  console.log('[getDailyStats] Querying for user:', userId, 'date:', today);

  const { data, error } = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single() as { data: DailyStatsRow | null; error: null };

  if (error) {
    console.log('[getDailyStats] Query error:', JSON.stringify(error, null, 2));
    return null;
  }

  if (!data) {
    console.log('[getDailyStats] No data found');
    return null;
  }

  console.log('[getDailyStats] Found data:', JSON.stringify(data, null, 2));

  return {
    total_calories: data.total_calories || 0,
    total_protein: data.total_protein || 0,
    total_carbs: data.total_carbs || 0,
    total_fat: data.total_fat || 0,
    diet_logs: (data.diet_logs as DietLogItem[]) || [],
  };
}

export async function deleteDietLog(
  userId: string,
  logId: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !logId) {
    return { success: false, error: '缺少必要参数' };
  }

  const today = getTodayDate();
  console.log('[deleteDietLog] Deleting log with id:', logId, 'for user:', userId);

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

  const currentDietLogs = (existingRecord.diet_logs as DietLogItem[]) || [];
  const targetLog = currentDietLogs.find((log) => log.id === logId);

  if (!targetLog) {
    return { success: false, error: '未找到该记录' };
  }

  const updatedDietLogs = currentDietLogs.filter((log) => log.id !== logId);

  const newTotalCalories = Math.max(0, (existingRecord.total_calories ?? 0) - (targetLog.calories || 0));
  const newTotalProtein = Math.max(0, (existingRecord.total_protein ?? 0) - (targetLog.protein || 0));
  const newTotalCarbs = Math.max(0, (existingRecord.total_carbs ?? 0) - (targetLog.carbs || 0));
  const newTotalFat = Math.max(0, (existingRecord.total_fat ?? 0) - (targetLog.fat || 0));

  const updateData = {
    total_calories: newTotalCalories,
    total_protein: newTotalProtein,
    total_carbs: newTotalCarbs,
    total_fat: newTotalFat,
    diet_logs: updatedDietLogs,
  };

  const updateResult = await supabase
    .from('daily_stats')
    // @ts-ignore - Supabase types issue
    .update(updateData)
    .eq('id', existingRecord.id);

  if (updateResult.error) {
    console.error('[deleteDietLog] Update error:', updateResult.error);
    return { success: false, error: `删除记录失败: ${updateResult.error.message}` };
  }

  revalidatePath('/');
  return { success: true };
}
