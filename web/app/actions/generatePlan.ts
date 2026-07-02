'use server';

import { openai } from '@/lib/openaiClient';
import { AI_CHAT_MODEL } from '@/lib/ai/model';
import { authedUserId } from '@/lib/auth/require-user';
import { ActionError } from '@/lib/errors';
import {
  createCustomPlan,
  setCurrentPlan,
  getCurrentPlanLight,
  type CustomPlanDay,
} from '@/app/actions/plans';
import { type PlanPreviewPayload } from '@/lib/plans/types';

interface GeneratedExercise {
  name?: string;
  sets?: number;
  reps_min?: number;
  reps_max?: number;
}

interface GeneratedDay {
  name?: string;
  rest_day?: boolean;
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

const SYSTEM_PROMPT = `You are FitCore's professional personal trainer. Based on the user's goal, design a structured weekly workout plan with concrete, well-known exercises.

Return JSON strictly:
{
  "name": string,                  // plan name (concise, e.g. "Upper/Lower Hypertrophy Split")
  "description": string,           // one-line description
  "goal": "general" | "strength" | "muscle_gain" | "fat_loss" | "endurance",
  "experience_level": "beginner" | "intermediate" | "advanced",
  "duration_weeks": number,        // 4-12
  "days": [                        // EXACTLY 7 elements, Monday → Sunday
    {
      "name": string,              // training-day name (e.g. "Chest & Triceps"); use "Rest" for rest days
      "rest_day": boolean,
      "exercises": [               // [] on rest days; 4-6 on training days
        { "name": string, "sets": number, "reps_min": number, "reps_max": number }
      ]
    }
  ]
}

Rules:
1) Use concrete, widely-recognized exercise names (e.g. "Barbell Bench Press", "Romanian Deadlift", "Lat Pulldown").
2) Choose a sensible training frequency and rest days for the goal (typically 3-5 training days/week).
3) sets 3-5; hypertrophy reps 8-12, strength 4-6, endurance 12-20.
4) Don't repeat the same exercise within a day.
5) Output JSON only — no extra text.`;

function safeParseJson(content: string): GeneratedPlan | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as GeneratedPlan;
    return null;
  } catch {
    return null;
  }
}

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

function builtPlanDataToPreview(
  planData: BuiltPlanData,
  aiPrompt?: string | null
): PlanPreviewPayload {
  return {
    name: planData.name,
    description: planData.description ?? null,
    goal: planData.goal ?? null,
    experience_level: planData.experience_level ?? null,
    duration_weeks: planData.duration_weeks ?? null,
    frequency_per_week: planData.frequency_per_week,
    days: planData.days.map((d) => ({
      name: d.name,
      rest_day: d.rest_day ?? false,
      exercises: d.exercises.map((e) => ({
        name: e.name,
        sets: e.sets ?? null,
        reps_min: e.reps_min ?? null,
        reps_max: e.reps_max ?? null,
        weight: e.weight ?? null,
      })),
    })),
    aiPrompt,
    isAiGenerated: true,
  }
}

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * Core LLM step shared by generate + adjust: ask the model for a 7-day plan with
 * free-text exercises, then normalize into `CustomPlanDay[]`. Does not persist.
 * No exercise catalog — the app is AI-first and stores exercises as free text.
 */
async function buildPlanStructureFromGoal(goalText: string): Promise<BuildResult> {
  let generated: GeneratedPlan | null = null;
  try {
    const response = await openai.chat.completions.create({
      model: AI_CHAT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `User goal: ${goalText}` },
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

  const rawDays = generated.days.slice(0, 7);
  const days: CustomPlanDay[] = rawDays.map((day, i) => {
    const exercises = (day.exercises ?? [])
      .map((ex) => {
        const name = typeof ex.name === 'string' ? ex.name.trim() : '';
        if (!name) return null;
        const repsMin = clampInt(ex.reps_min, 1, 50, 8);
        const repsMax = clampInt(ex.reps_max, repsMin, 50, Math.max(repsMin, 12));
        return {
          name,
          sets: clampInt(ex.sets, 1, 8, 3),
          reps_min: repsMin,
          reps_max: repsMax,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const isRest = day.rest_day === true || exercises.length === 0;
    return {
      name: day.name?.trim() || (isRest ? 'Rest' : `Training day ${i + 1}`),
      rest_day: isRest,
      exercises,
    };
  });

  // Pad to 7 days so the weekly (Mon–Sun) mapping downstream stays consistent.
  while (days.length < 7) {
    days.push({ name: 'Rest', rest_day: true, exercises: [] });
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
 * it via `createCustomPlan` with AI provenance.
 */
export async function generateWorkoutPlan(input: GeneratePlanInput) {
  const preview = await previewWorkoutPlan(input);
  if (!preview.success || !('data' in preview) || !preview.data) {
    return preview;
  }
  return confirmWorkoutPlan(preview.data);
}

export interface PreviewPlanInput {
  /** Free-text goal for a brand-new plan, e.g. "Build muscle, train 4 days/week". */
  goalText?: string;
  /** Conversational adjustment request; if a current plan exists it is used as context. */
  instruction?: string;
}

async function buildAdjustmentGoalText(instruction: string): Promise<string | null> {
  const currentRes = await getCurrentPlanLight();
  if (!currentRes.success || !currentRes.data?.plan) {
    // No active plan: treat the instruction itself as the generation prompt.
    return instruction;
  }

  const current = currentRes.data.plan as {
    name?: string | null;
    goal?: string | null;
    frequency_per_week?: number | null;
    ai_prompt?: string | null;
  };

  return [
    `Current plan: "${current.name ?? 'Workout plan'}"`,
    `Goal: ${current.goal ?? 'general'}`,
    `Training per week: ${current.frequency_per_week ?? 'unknown'} days`,
    current.ai_prompt ? `Original request: ${current.ai_prompt}` : null,
    `Adjustment request: ${instruction}`,
    'Keeping a sensible structure, re-output a complete weekly plan following the adjustment request.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Build a plan preview from a free-text goal or an adjustment instruction.
 * Does not persist anything — the caller must confirm via `confirmWorkoutPlan`.
 */
export async function previewWorkoutPlan(input: PreviewPlanInput) {
  const a = await authedUserId();
  if (!a.ok) return a.result;

  const instruction = input.instruction?.trim();
  const goalText = input.goalText?.trim();
  if (!instruction && !goalText) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const prompt = instruction
    ? await buildAdjustmentGoalText(instruction)
    : goalText;
  if (!prompt) {
    return { success: false, error: ActionError.PLAN_NOT_FOUND };
  }

  const built = await buildPlanStructureFromGoal(prompt);
  if (!built.ok) {
    return { success: false, error: built.error };
  }

  return {
    success: true,
    data: builtPlanDataToPreview(built.planData, instruction ?? goalText ?? null),
  };
}

/**
 * Persist a previously-generated plan preview: create the plan, then set it as
 * the user's current plan so "today's workout" reflects it immediately.
 */
export async function confirmWorkoutPlan(preview: PlanPreviewPayload) {
  const a = await authedUserId();
  if (!a.ok) return a.result;

  if (!preview?.name?.trim() || !Array.isArray(preview.days) || preview.days.length === 0) {
    return { success: false, error: ActionError.MISSING_PARAMS };
  }

  const created = await createCustomPlan(
    {
      name: preview.name,
      description: preview.description ?? undefined,
      goal: preview.goal ?? undefined,
      experience_level: preview.experience_level ?? undefined,
      frequency_per_week: preview.frequency_per_week,
      duration_weeks: preview.duration_weeks ?? undefined,
      days: preview.days,
    },
    {
      isAiGenerated: preview.isAiGenerated ?? true,
      aiPrompt: preview.aiPrompt ?? 'AI-generated plan',
      aiModelVersion: AI_CHAT_MODEL,
    }
  );

  if (created.success && 'data' in created && created.data?.id) {
    await setCurrentPlan(created.data.id);
  }

  return created;
}

export interface AdjustPlanInput {
  /** Natural-language tweak, e.g. "swap leg day for upper body" / "lower the intensity" / "only 3 days this week". */
  instruction: string;
}

/**
 * Conversationally adjust the user's workout plan: regenerates a preview from
 * the current plan + instruction. The caller must confirm via `confirmWorkoutPlan`.
 */
export async function adjustWorkoutPlan(input: AdjustPlanInput) {
  return previewWorkoutPlan({ instruction: input.instruction });
}
