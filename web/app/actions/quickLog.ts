'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { openai } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabaseClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';
import { Database } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import { authedUserId } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats';
import type { DietLogItem, WorkoutLogItem } from './types';

type FoodLogInsert = Database['public']['Tables']['food_logs']['Insert'];
type WorkoutLogInsert = Database['public']['Tables']['workout_logs']['Insert'];

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
export async function quickLog(userInput: string): Promise<QuickLogResponse> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  const trimmed = userInput.trim();
  if (!trimmed) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const segments = await parseQuickLog(trimmed);
  if (segments.length === 0) {
    return { success: false, error: ActionError.AI_PARSE_EMPTY };
  }

  const today = getTodayDate();
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

  // Insert the parsed items into their normalized tables, then recompute the
  // daily_stats aggregate cache once.
  if (dietLogs.length > 0) {
    const foodRows: FoodLogInsert[] = dietLogs.map((d) => ({
      id: d.id,
      user_id: userId,
      date: today,
      food_name: d.food_name,
      calories: d.calories,
      protein: d.protein,
      carbs: d.carbs,
      fat: d.fat,
      logged_at: d.logged_at,
    }));
    const { error } = await supabase.from('food_logs').insert(foodRows);
    if (error) {
      console.error('[quickLog] food insert error:', error.message);
      return { success: false, error: ActionError.DB_INSERT_FAILED };
    }
  }

  if (workoutLogs.length > 0) {
    const workoutRows: WorkoutLogInsert[] = workoutLogs.map((w) => ({
      id: w.id,
      user_id: userId,
      date: today,
      workout_name: w.workout_name,
      sets: w.sets,
      duration_minutes: w.duration_minutes,
      calories_burned: w.calories_burned,
      logged_at: w.logged_at,
    }));
    const { error } = await supabase.from('workout_logs').insert(workoutRows);
    if (error) {
      console.error('[quickLog] workout insert error:', error.message);
      return { success: false, error: ActionError.DB_INSERT_FAILED };
    }
  }

  await recomputeDailyStats(userId, today);

  revalidatePath('/');
  return { success: true, items: results };
}
