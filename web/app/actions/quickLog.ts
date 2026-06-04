'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { openai } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabaseClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import type { DietLogItem, WorkoutLogItem } from './types';

type DailyStatsRow = Database['public']['Tables']['daily_stats']['Row'];
type DailyStatsInsert = Database['public']['Tables']['daily_stats']['Insert'];

export type QuickLogFoodResult = {
  kind: 'food';
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type QuickLogWorkoutResult = {
  kind: 'workout';
  id: string;
  name: string;
  sets: number | null;
  durationMinutes: number;
  caloriesBurned: number;
};

export type QuickLogResult = QuickLogFoodResult | QuickLogWorkoutResult;

export type QuickLogResponse =
  | { success: true; items: QuickLogResult[] }
  | { success: false; error: string };

interface ParsedSegment {
  kind: 'food' | 'workout';
  food_name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  workout_name?: string;
  sets?: number | null;
  duration_minutes?: number;
  calories_burned?: number;
}

const SYSTEM_PROMPT = `你是 FitCore 的快捷记录解析器。用户用一句自然语言可能同时记录"吃了什么"和"练了什么"，你需要把它拆开并准确提取每一项的结构化数据。

返回 JSON：{ "items": ParsedSegment[] }

每个 ParsedSegment 形状：
- kind: "food" 或 "workout" — 必填
- 当 kind="food"：
  - food_name: string — 保留用户原话中的份量（如 "30g 蛋白粉"）
  - calories: int (kcal)
  - protein: int (g)
  - carbs: int (g)
  - fat: int (g)
- 当 kind="workout"：
  - workout_name: string — 标准化的运动名（如 "深蹲"、"跑步"）
  - sets: int | null — 没说就给 null
  - duration_minutes: int
  - calories_burned: int (kcal)

营养/能耗参考（60kg 成年人）：
- 鸡胸肉 100g≈165kcal/31P/0C/4F；蛋白粉 100g≈380kcal/75P/8C/3F；米饭 100g≈130kcal/3P/28C/0F；鸡蛋 1个≈70kcal/6P/1C/5F
- 深蹲 10次≈9kcal；卧推 10次≈7kcal；硬拉 10次≈11kcal；引体向上 10次≈9kcal；俯卧撑 10次≈6kcal
- 跑步 1分钟≈11kcal；跳绳 1分钟≈13kcal；游泳 1分钟≈9kcal；骑行 1分钟≈8kcal

规则：
1) 单条输入可能含多项，请全部识别。
2) 重量、次数、组数都要按比例换算。
3) 没提到组数就 sets=null；没提到时长就用组数估算。
4) 只输出可信的结构化数据；含糊不清的也尽量给出合理估算，绝不返回空。
`;

async function parseQuickLog(userInput: string): Promise<ParsedSegment[]> {
  const response = await openai.chat.completions.create({
    model: AI_FAST_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userInput },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  // Accept either { items: [...] } or a bare array, and tolerate single-object
  // returns from less-disciplined models.
  let items: ParsedSegment[] = [];
  if (Array.isArray(parsed)) {
    items = parsed as ParsedSegment[];
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as { items?: unknown; kind?: unknown };
    if (Array.isArray(obj.items)) {
      items = obj.items as ParsedSegment[];
    } else if (typeof obj.kind === 'string') {
      items = [obj as ParsedSegment];
    }
  }

  return items.filter((it) => it && (it.kind === 'food' || it.kind === 'workout'));
}

/**
 * Single-shot quick-log entrypoint for the natural-language command bar.
 *
 * Flow: 1 LLM call to classify+segment+extract → 1 supabase round-trip to
 * either insert or merge into today's daily_stats row. Significantly cheaper
 * than calling logFood + logWorkout separately for mixed inputs.
 */
export async function quickLog(userInput: string, userId: string): Promise<QuickLogResponse> {
  const trimmed = userInput.trim();
  if (!trimmed || !userId) {
    return { success: false, error: '缺少必要参数' };
  }

  const segments = await parseQuickLog(trimmed);
  if (segments.length === 0) {
    return { success: false, error: 'AI 未能解析这条输入，请换个说法或拆分成多次输入' };
  }

  const dietLogs: DietLogItem[] = [];
  const workoutLogs: WorkoutLogItem[] = [];
  const results: QuickLogResult[] = [];
  const nowIso = new Date().toISOString();

  for (const seg of segments) {
    if (seg.kind === 'food') {
      const id = randomUUID();
      const name = seg.food_name?.trim() || '未知食物';
      const calories = Math.round(Number(seg.calories) || 0);
      const protein = Math.round(Number(seg.protein) || 0);
      const carbs = Math.round(Number(seg.carbs) || 0);
      const fat = Math.round(Number(seg.fat) || 0);
      dietLogs.push({ id, food_name: name, calories, protein, carbs, fat, logged_at: nowIso });
      results.push({ kind: 'food', id, name, calories, protein, carbs, fat });
    } else {
      const id = randomUUID();
      const name = seg.workout_name?.trim() || '未知运动';
      const sets =
        seg.sets === null || seg.sets === undefined ? null : Math.round(Number(seg.sets));
      const duration = Math.round(Number(seg.duration_minutes) || 0);
      const calories = Math.round(Number(seg.calories_burned) || 0);
      workoutLogs.push({
        id,
        workout_name: name,
        sets,
        duration_minutes: duration,
        calories_burned: calories,
        logged_at: nowIso,
      });
      results.push({
        kind: 'workout',
        id,
        name,
        sets,
        durationMinutes: duration,
        caloriesBurned: calories,
      });
    }
  }

  const today = getTodayDate();
  const queryResult = await supabase
    .from('daily_stats')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const existing = queryResult.data as DailyStatsRow | null;
  const queryError = queryResult.error;

  if (queryError && queryError.code !== 'PGRST116') {
    console.error('[quickLog] Query error:', queryError.message);
    return { success: false, error: `查询数据库失败: ${queryError.message}` };
  }

  const sumDiet = dietLogs.reduce(
    (acc, d) => {
      acc.cal += d.calories;
      acc.protein += d.protein;
      acc.carbs += d.carbs;
      acc.fat += d.fat;
      return acc;
    },
    { cal: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const sumWorkout = workoutLogs.reduce(
    (acc, w) => {
      acc.cal += w.calories_burned;
      acc.minutes += w.duration_minutes;
      return acc;
    },
    { cal: 0, minutes: 0 }
  );

  if (existing) {
    const mergedDiet = [...((existing.diet_logs as DietLogItem[]) ?? []), ...dietLogs];
    const mergedWorkout = [
      ...((existing.workout_logs as WorkoutLogItem[]) ?? []),
      ...workoutLogs,
    ];

    const updateData = {
      total_calories: (existing.total_calories ?? 0) + sumDiet.cal,
      total_protein: (existing.total_protein ?? 0) + sumDiet.protein,
      total_carbs: (existing.total_carbs ?? 0) + sumDiet.carbs,
      total_fat: (existing.total_fat ?? 0) + sumDiet.fat,
      calories_burned: (existing.calories_burned ?? 0) + sumWorkout.cal,
      workout_duration: (existing.workout_duration ?? 0) + sumWorkout.minutes,
      diet_logs: mergedDiet,
      workout_logs: mergedWorkout,
    };

    const updateResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .update(updateData)
      .eq('id', existing.id);

    if (updateResult.error) {
      console.error('[quickLog] Update error:', updateResult.error.message);
      return { success: false, error: `更新记录失败: ${updateResult.error.message}` };
    }
  } else {
    const insertData: Omit<DailyStatsInsert, 'id'> = {
      user_id: userId,
      date: today,
      total_calories: sumDiet.cal,
      total_protein: sumDiet.protein,
      total_carbs: sumDiet.carbs,
      total_fat: sumDiet.fat,
      calories_burned: sumWorkout.cal,
      workout_duration: sumWorkout.minutes,
      water_intake: 0,
      diet_logs: dietLogs as unknown as DailyStatsInsert['diet_logs'],
      workout_logs: workoutLogs as unknown as DailyStatsInsert['workout_logs'],
    };

    const insertResult = await supabase
      .from('daily_stats')
      // @ts-ignore - Supabase types issue
      .insert(insertData);

    if (insertResult.error) {
      console.error('[quickLog] Insert error:', insertResult.error.message);
      return { success: false, error: `创建记录失败: ${insertResult.error.message}` };
    }
  }

  revalidatePath('/');
  return { success: true, items: results };
}
