'use server';

import { openai } from '@/lib/openaiClient';
import { supabase } from '@/lib/supabaseClient';
import { AI_CHAT_MODEL } from '@/lib/ai/model';
import { authedUserId } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import {
  createCustomPlan,
  setCurrentPlan,
  deletePlan,
  getCurrentPlanLight,
  type CustomPlanDay,
} from '@/app/actions/plans';

/** A trimmed exercise row used to build the catalog the LLM picks from. */
interface CatalogExercise {
  id: string;
  name: string;
  name_en: string | null;
  category: string | null;
  muscle_groups: string[] | null;
}

interface GeneratedExercise {
  idx?: number;
  target_sets?: number;
  target_reps_min?: number;
  target_reps_max?: number;
}

interface GeneratedDay {
  name?: string;
  rest_day?: boolean;
  focus_muscles?: string[];
  exercises?: GeneratedExercise[];
}

interface GeneratedPlan {
  name?: string;
  description?: string;
  goal?: string;
  experience_level?: string;
  duration_weeks?: number;
  days?: GeneratedDay[];
}

export interface GeneratePlanInput {
  /** Free-text goal, e.g. "Build muscle, train 4 days/week, have dumbbells and a barbell". */
  goalText: string;
}

const SYSTEM_PROMPT = `You are FitCore's professional personal trainer. Based on the user's goal and the list of available exercises, design a structured weekly workout plan.

Return JSON strictly:
{
  "name": string,                  // plan name (concise, e.g. "Upper/Lower Hypertrophy Split")
  "description": string,           // one-line description
  "goal": "general" | "strength" | "muscle_gain" | "fat_loss" | "endurance",
  "experience_level": "beginner" | "intermediate" | "advanced",
  "duration_weeks": number,        // 4-12
  "days": [                        // must be exactly 7 elements, Monday → Sunday
    {
      "name": string,              // training-day name (e.g. "Chest/Triceps"); use "Rest" for rest days
      "rest_day": boolean,
      "focus_muscles": string[],   // target muscle groups for the day (English, e.g. ["Chest","Triceps"]); [] on rest days
      "exercises": [               // [] on rest days; 4-6 on training days
        { "idx": number, "target_sets": number, "target_reps_min": number, "target_reps_max": number }
      ]
    }
  ]
}

Rules:
1) exercises[].idx must be a number from the "available exercises" list below — never invent indices or exercises.
2) Set a sensible training frequency and rest days for the goal (typically 3-5 days/week).
3) target_sets 3-5; hypertrophy reps 8-12, strength 4-6, endurance 12-20.
4) Don't repeat the same exercise within a day; prioritize that day's focus_muscles.
5) Output JSON only — no extra text.`;

function buildCatalogText(catalog: CatalogExercise[]): string {
  return catalog
    .map((e, i) => {
      const name = e.name_en?.trim() || e.name;
      const muscles = (e.muscle_groups ?? []).join('/');
      const cat = e.category ?? '';
      const meta = [muscles, cat].filter(Boolean).join(' · ');
      return `${i + 1}. ${name}${meta ? ` (${meta})` : ''}`;
    })
    .join('\n');
}

function safeParseJson(content: string): GeneratedPlan | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as GeneratedPlan;
    return null;
  } catch {
    return null;
  }
}

/** Shape passed to `createCustomPlan`, produced by the LLM structure step. */
interface BuiltPlanData {
  name: string;
  description?: string;
  goal?: string;
  experience_level?: string;
  frequency_per_week: number;
  duration_weeks?: number;
  days: CustomPlanDay[];
}

type BuildResult =
  | { ok: true; planData: BuiltPlanData }
  | { ok: false; error: string };

/**
 * Core LLM step shared by generate + adjust: load an exercise catalog, ask the
 * model to pick exercises *by index* (so every reference is a real `exercises`
 * row), then normalize into a 7-day `CustomPlanDay[]`. Does not persist.
 */
async function buildPlanStructureFromGoal(goalText: string): Promise<BuildResult> {
  // Pull a catalog the model can choose from. Prefer system exercises (curated),
  // ordered by popularity, capped so the prompt stays bounded.
  const { data: catalogRows, error: catalogError } = await supabase
    .from('exercises')
    .select('id, name, name_en, category, muscle_groups')
    .order('usage_count', { ascending: false })
    .limit(150);

  if (catalogError || !catalogRows || catalogRows.length === 0) {
    return { ok: false, error: ActionError.DB_QUERY_FAILED };
  }

  const catalog = catalogRows as CatalogExercise[];
  const catalogText = buildCatalogText(catalog);

  let generated: GeneratedPlan | null = null;
  try {
    const response = await openai.chat.completions.create({
      model: AI_CHAT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `User goal: ${goalText}\n\nAvailable exercises (reference by index):\n${catalogText}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });
    const content = response.choices[0]?.message?.content;
    if (content) generated = safeParseJson(content);
  } catch (error) {
    console.error('[buildPlanStructureFromGoal] LLM error:', error);
    return { ok: false, error: ActionError.AI_PARSE_FAILED };
  }

  if (!generated || !Array.isArray(generated.days) || generated.days.length === 0) {
    return { ok: false, error: ActionError.AI_PARSE_EMPTY };
  }

  // Normalize to exactly 7 day slots (Mon→Sun), mapping idx → exercise_id and
  // dropping any out-of-range references the model may have produced.
  const rawDays = generated.days.slice(0, 7);
  const days: CustomPlanDay[] = rawDays.map((day, i) => {
    const isRest = day.rest_day === true;
    const exercises = (day.exercises ?? [])
      .map((ex) => {
        const idx = Number(ex.idx);
        if (!Number.isInteger(idx) || idx < 1 || idx > catalog.length) return null;
        const match = catalog[idx - 1];
        const setsNum = Math.round(Number(ex.target_sets) || 3);
        const repsMin = Math.round(Number(ex.target_reps_min) || 8);
        const repsMax = Math.round(Number(ex.target_reps_max) || 12);
        return {
          exercise_id: match.id,
          target_sets: Math.min(8, Math.max(1, setsNum)),
          target_reps_min: Math.min(50, Math.max(1, repsMin)),
          target_reps_max: Math.min(50, Math.max(repsMin, repsMax)),
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    return {
      name: day.name?.trim() || (isRest ? 'Rest' : `Training day ${i + 1}`),
      focus_muscles: Array.isArray(day.focus_muscles) ? day.focus_muscles : [],
      rest_day: isRest || exercises.length === 0,
      exercises,
    };
  });

  // Pad to 7 days so the weekly (Mon–Sun) mapping downstream stays consistent.
  while (days.length < 7) {
    days.push({ name: 'Rest', focus_muscles: [], rest_day: true, exercises: [] });
  }

  const trainingDays = days.filter((d) => !d.rest_day).length;
  if (trainingDays === 0) {
    return { ok: false, error: ActionError.AI_PARSE_EMPTY };
  }

  return {
    ok: true,
    planData: {
      name: generated.name?.trim() || 'AI workout plan',
      description: generated.description?.trim() || undefined,
      goal: generated.goal || 'general',
      experience_level: generated.experience_level || 'beginner',
      frequency_per_week: trainingDays,
      duration_weeks:
        typeof generated.duration_weeks === 'number'
          ? Math.min(52, Math.max(1, Math.round(generated.duration_weeks)))
          : undefined,
      days,
    },
  };
}

/**
 * Generate a structured workout plan from a natural-language goal and persist
 * it via `createCustomPlan` with AI provenance (`is_ai_generated`, etc.).
 */
export async function generateWorkoutPlan(input: GeneratePlanInput) {
  const a = await authedUserId();
  if (!a.ok) return a.result;

  const goalText = input.goalText?.trim();
  if (!goalText) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const built = await buildPlanStructureFromGoal(goalText);
  if (!built.ok) {
    return { success: false, error: built.error };
  }

  return createCustomPlan(built.planData, {
    isAiGenerated: true,
    aiPrompt: goalText,
    aiModelVersion: AI_CHAT_MODEL,
  });
}

export interface AdjustPlanInput {
  /** Natural-language tweak, e.g. "swap leg day for upper body" / "lower the intensity" / "only 3 days this week". */
  instruction: string;
}

/**
 * Conversationally adjust the user's *current* plan. Because day/exercise rows
 * can't be patched piecemeal cleanly, we regenerate a fresh structure from the
 * original goal + the new instruction, set it as current, then retire the old
 * plan. Backs the coach's `adjust_plan` tool.
 */
export async function adjustWorkoutPlan(input: AdjustPlanInput) {
  const a = await authedUserId();
  if (!a.ok) return a.result;

  const instruction = input.instruction?.trim();
  if (!instruction) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const currentRes = await getCurrentPlanLight();
  if (!currentRes.success || !currentRes.data?.plan) {
    return { success: false, error: ActionError.PLAN_NOT_FOUND };
  }

  const current = currentRes.data.plan as {
    id: string;
    name?: string | null;
    goal?: string | null;
    frequency_per_week?: number | null;
    ai_prompt?: string | null;
  };

  const goalText = [
    `Current plan: "${current.name ?? 'Workout plan'}"`,
    `Goal: ${current.goal ?? 'general'}`,
    `Training per week: ${current.frequency_per_week ?? 'unknown'} days`,
    current.ai_prompt ? `Original request: ${current.ai_prompt}` : null,
    `Adjustment request: ${instruction}`,
    'Keeping a sensible structure, re-output a complete weekly plan following the adjustment request.',
  ]
    .filter(Boolean)
    .join('\n');

  const built = await buildPlanStructureFromGoal(goalText);
  if (!built.ok) {
    return { success: false, error: built.error };
  }

  const created = await createCustomPlan(built.planData, {
    isAiGenerated: true,
    aiPrompt: `[adjust] ${instruction}`,
    aiModelVersion: AI_CHAT_MODEL,
  });

  if (!created.success || !created.data?.id) {
    return created;
  }

  // Swap current → new, then retire the superseded plan. Failures here are
  // non-fatal: the new plan already exists and is usable.
  await setCurrentPlan(created.data.id);
  if (current.id && current.id !== created.data.id) {
    await deletePlan(current.id);
  }

  return created;
}
