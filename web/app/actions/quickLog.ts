'use server';

import { revalidatePath } from 'next/cache';
import { createHash, randomUUID } from 'crypto';
import { openai } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabaseClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';
import { fetchNutritionApi } from '@/lib/ai/nutrition-client';
import { Database, Json } from '@/lib/database.types';
import { getTodayDate } from '@/lib/utils/date';
import { authedUserId } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
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

const SYSTEM_PROMPT = `You are FitCore's quick-log parser. In one natural-language sentence the user may log both what they ate and what they did, so split it apart and accurately extract structured data for each item.

Return JSON: { "items": ParsedSegment[] }

Each ParsedSegment shape:
- kind: "food" or "workout" — required
- when kind="food":
  - food_name: string — keep the portion from the user's wording (e.g. "30g whey protein")
  - Do not estimate nutrition: a dedicated nutrition model handles each food item.
- when kind="workout":
  - workout_name: string — a normalized workout name (e.g. "Squat", "Running")
  - sets: int | null — null if not stated
  - duration_minutes: int
  - calories_burned: int (kcal)

Workout burn references (60kg adult):
- Squat 10 reps≈9kcal; bench press 10 reps≈7kcal; deadlift 10 reps≈11kcal; pull-up 10 reps≈9kcal; push-up 10 reps≈6kcal
- Running 1 min≈11kcal; jump rope 1 min≈13kcal; swimming 1 min≈9kcal; cycling 1 min≈8kcal

Rules:
1) A single input may contain multiple items — identify all of them.
2) Scale by weight, reps, and sets proportionally.
3) If sets aren't mentioned, sets=null; if duration isn't mentioned, estimate from sets.
4) Only output credible structured data; for vague inputs still give a reasonable estimate — never return empty.
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

  const segments = items.filter((it) => it && (it.kind === 'food' || it.kind === 'workout'));
  // Keep the mixed-log splitter while using the main branch's specialized
  // nutrition model. All parsing finishes before the atomic database write.
  return Promise.all(segments.map(async (segment) => {
    if (segment.kind !== 'food') return segment;
    const description = segment.food_name?.trim();
    if (!description) throw new Error('Food segment is missing its description');
    const nutrition = await fetchNutritionApi(description);
    return { ...segment, ...nutrition };
  }));
}

async function getCommittedQuickLog(
  userId: string,
  requestId: string,
  requestHash: string
): Promise<QuickLogResponse | null> {
  const { data, error } = await supabase.rpc('get_quick_log_result', {
    p_user_id: userId,
    p_request_id: requestId,
    p_request_hash: requestHash,
  });

  if (error) {
    console.error('[quickLog] idempotency lookup error:', error.message);
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  if (data === null) return null;
  if (typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.items)) {
    console.error('[quickLog] idempotency lookup returned an invalid result');
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  return { success: true, items: data.items as unknown as QuickLogResult[] };
}

/**
 * Single-shot quick-log entrypoint for the natural-language command bar.
 *
 * Flow: Gemini splits food/workouts → Qwen estimates food nutrition → an atomic RPC
 * inserts every item and refreshes today's aggregate. The request id makes a
 * repeated delivery return the original result instead of inserting again.
 */
export async function quickLog(
  userInput: string,
  requestId?: string
): Promise<QuickLogResponse> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  const trimmed = userInput.trim();
  if (!trimmed) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const resolvedRequestId = requestId ?? randomUUID();
  const requestHash = createHash('sha256').update(trimmed).digest('hex');
  const cached = await getCommittedQuickLog(userId, resolvedRequestId, requestHash);
  if (cached) {
    if (cached.success) revalidatePath('/');
    return cached;
  }
  let segments: ParsedSegment[];
  try {
    segments = await parseQuickLog(trimmed);
  } catch (parseError) {
    // A committed request may have lost its response. Recover its cached result
    // if a transient AI failure prevents parsing the retry.
    const cached = await getCommittedQuickLog(userId, resolvedRequestId, requestHash);
    if (cached) {
      if (cached.success) revalidatePath('/');
      return cached;
    }
    throw parseError;
  }

  if (segments.length === 0) {
    const cached = await getCommittedQuickLog(userId, resolvedRequestId, requestHash);
    if (cached) {
      if (cached.success) revalidatePath('/');
      return cached;
    }
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
      const name = seg.food_name?.trim() || 'Unknown food';
      const calories = Math.round(Number(seg.calories) || 0);
      const protein = Math.round(Number(seg.protein) || 0);
      const carbs = Math.round(Number(seg.carbs) || 0);
      const fat = Math.round(Number(seg.fat) || 0);
      dietLogs.push({ id, food_name: name, calories, protein, carbs, fat, logged_at: nowIso });
      results.push({ kind: 'food', id, name, calories, protein, carbs, fat });
    } else {
      const id = randomUUID();
      const name = seg.workout_name?.trim() || 'Unknown workout';
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

  const { data, error } = await supabase.rpc('commit_quick_log', {
    p_user_id: userId,
    p_request_id: resolvedRequestId,
    p_request_hash: requestHash,
    p_date: today,
    p_food_rows: foodRows as unknown as Json,
    p_workout_rows: workoutRows as unknown as Json,
    p_items: results as unknown as Json,
  });

  if (error) {
    console.error('[quickLog] atomic save error:', error.message);
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.items)) {
    console.error('[quickLog] atomic save returned an invalid result');
    return { success: false, error: ActionError.DB_INSERT_FAILED };
  }

  const committedItems = data.items as unknown as QuickLogResult[];

  revalidatePath('/');
  return { success: true, items: committedItems };
}
