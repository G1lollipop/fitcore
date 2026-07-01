'use server';

import { supabase } from '@/lib/supabaseClient';
import { Database, Json } from '@/lib/database.types';
import { createModuleLogger } from '@/lib/logger';
import { authedUserId } from '@/lib/auth/require-user';
import { planMetaSchema, firstZodError } from '@/lib/validation/schemas';
import { ActionError } from '@/lib/errors';
import {
  emptyPlanStructure,
  normalizePlanStructure,
  type PlanStructure,
} from '@/lib/plans/types';

type WorkoutPlanInsert = Database['public']['Tables']['workout_plans']['Insert'];

const planLogger = createModuleLogger('PlanAPI');

// Columns selected for plan reads. Plans now carry their whole body in the
// `structure` JSON column — no day/exercise joins.
const PLAN_COLUMNS = `
  id,
  name,
  description,
  goal,
  experience_level,
  frequency_per_week,
  duration_weeks,
  completed_sessions,
  is_ai_generated,
  ai_prompt,
  structure,
  created_at
`;

/**
 * Verifies the given plan exists and is owned by `userId`.
 * Returns null on success, or a failure result to return to the caller.
 */
async function assertPlanOwner(
  planId: string,
  userId: string
): Promise<{ success: false; error: string } | null> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('creator_id')
    .eq('id', planId)
    .single();

  if (error || !data) {
    return { success: false, error: ActionError.PLAN_NOT_FOUND };
  }
  if (data.creator_id !== userId) {
    return { success: false, error: ActionError.FORBIDDEN };
  }
  return null;
}

export async function getUserPlansLight() {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  try {
    planLogger.info('Fetching user plans', { userId });

    const { data, error } = await supabase
      .from('workout_plans')
      .select(PLAN_COLUMNS)
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      planLogger.error('Failed to fetch user plans', { error: error.message, userId });
      throw new Error(error.message);
    }

    return { success: true, data };
  } catch (error) {
    planLogger.error('Error fetching user plans', { error: String(error), userId });
    return { success: false, error: String(error) };
  }
}

export async function getCurrentPlanLight() {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  try {
    planLogger.info("Fetching user's current plan", { userId });

    const { data: settingsWithPlan, error } = await supabase
      .from('user_settings')
      .select(`
        current_plan_id,
        current_plan_start_date,
        workout_plans!current_plan_id (${PLAN_COLUMNS})
      `)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      planLogger.warn('Failed to fetch user settings', { error: error.message });
    }

    if (!settingsWithPlan?.current_plan_id || !settingsWithPlan?.workout_plans) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        plan: settingsWithPlan.workout_plans,
        startDate: settingsWithPlan.current_plan_start_date,
      },
    };
  } catch (error) {
    planLogger.error('Error fetching current plan', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function updatePlan(
  planId: string,
  updates: Record<string, unknown>
) {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const ownerCheck = await assertPlanOwner(planId, a.userId);
  if (ownerCheck) return ownerCheck;
  try {
    planLogger.info('Updating plan', { planId });

    const { data, error } = await supabase
      .from('workout_plans')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .select(PLAN_COLUMNS)
      .single();

    if (error) {
      planLogger.error('Failed to update plan', { error: error.message, planId });
      throw new Error(error.message);
    }

    return { success: true, data };
  } catch (error) {
    planLogger.error('Error updating plan', { error: String(error), planId });
    return { success: false, error: String(error) };
  }
}

/**
 * Overwrite a plan's whole day/exercise body (`workout_plans.structure`). The
 * incoming structure is normalized to a well-formed 7-day (Mon–Sun) shape and
 * `frequency_per_week` is recomputed from the training-day count so metadata
 * stays in sync with the edited body. Ownership is validated like other writes.
 */
export async function updatePlanStructure(planId: string, structure: PlanStructure) {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const ownerCheck = await assertPlanOwner(planId, a.userId);
  if (ownerCheck) return ownerCheck;
  try {
    planLogger.info('Updating plan structure', { planId });

    const normalized = normalizePlanStructure(structure);
    const trainingDays = normalized.days.filter((d) => !d.rest_day).length;

    const { data, error } = await supabase
      .from('workout_plans')
      .update({
        structure: normalized as unknown as Json,
        frequency_per_week: trainingDays || 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .select(PLAN_COLUMNS)
      .single();

    if (error) {
      planLogger.error('Failed to update plan structure', { error: error.message, planId });
      throw new Error(error.message);
    }

    return { success: true, data };
  } catch (error) {
    planLogger.error('Error updating plan structure', { error: String(error), planId });
    return { success: false, error: String(error) };
  }
}

export async function deletePlan(planId: string) {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const ownerCheck = await assertPlanOwner(planId, a.userId);
  if (ownerCheck) return ownerCheck;
  try {
    planLogger.info('Deleting plan', { planId });

    const { error } = await supabase.from('workout_plans').delete().eq('id', planId);

    if (error) {
      planLogger.error('Failed to delete plan', { error: error.message, planId });
      throw new Error(error.message);
    }

    return { success: true };
  } catch (error) {
    planLogger.error('Error deleting plan', { error: String(error), planId });
    return { success: false, error: String(error) };
  }
}

export async function setCurrentPlan(planId: string) {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;
  const ownerCheck = await assertPlanOwner(planId, userId);
  if (ownerCheck) return ownerCheck;
  try {
    planLogger.info('Setting current plan', { userId, planId });

    const today = new Date().toISOString().split('T')[0];

    const { data: settings, error: fetchError } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      planLogger.error('Failed to fetch user settings', { error: fetchError.message });
      throw new Error(fetchError.message);
    }

    if (settings) {
      const { error: updateError } = await supabase
        .from('user_settings')
        .update({ current_plan_id: planId, current_plan_start_date: today })
        .eq('user_id', userId);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { error: insertError } = await supabase.from('user_settings').insert({
        user_id: userId,
        current_plan_id: planId,
        current_plan_start_date: today,
        target_calories: 2500,
        target_protein: 150,
        target_carbs: 300,
        target_fat: 80,
      });
      if (insertError) throw new Error(insertError.message);
    }

    return { success: true };
  } catch (error) {
    planLogger.error('Error setting current plan', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export interface CustomPlanExercise {
  name: string;
  sets?: number | null;
  reps_min?: number | null;
  reps_max?: number | null;
  weight?: number | null;
}

export interface CustomPlanDay {
  name: string;
  rest_day?: boolean;
  exercises: CustomPlanExercise[];
}

/** Optional AI-provenance metadata for plans generated by the coach. */
export interface PlanAiMeta {
  isAiGenerated?: boolean;
  aiPrompt?: string;
  aiModelVersion?: string;
}

/** Build a normalized 7-day (Mon–Sun) structure from caller-supplied days. */
function buildStructure(days: CustomPlanDay[]): PlanStructure {
  const structure = emptyPlanStructure();
  days.slice(0, 7).forEach((day, i) => {
    const isRest = day.rest_day === true || !day.exercises || day.exercises.length === 0;
    structure.days[i] = {
      name: day.name?.trim() || (isRest ? 'Rest' : `Day ${i + 1}`),
      rest_day: isRest,
      exercises: isRest
        ? []
        : day.exercises.map((ex) => ({
            name: ex.name.trim(),
            sets: ex.sets ?? null,
            reps_min: ex.reps_min ?? null,
            reps_max: ex.reps_max ?? null,
            weight: ex.weight ?? null,
          })),
    };
  });
  return structure;
}

export async function createCustomPlan(
  planData: {
    name: string;
    description?: string;
    goal?: string;
    experience_level?: string;
    frequency_per_week: number;
    duration_weeks?: number;
    days: CustomPlanDay[];
  },
  aiMeta?: PlanAiMeta
) {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;

  const parsed = planMetaSchema.safeParse(planData);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  try {
    planLogger.info('Creating custom plan', { userId, planName: planData.name });

    const structure = buildStructure(planData.days);
    const trainingDays = structure.days.filter((d) => !d.rest_day).length;

    const insert: WorkoutPlanInsert = {
      name: planData.name,
      description: planData.description || null,
      goal: planData.goal || 'general',
      experience_level: planData.experience_level || 'beginner',
      frequency_per_week: trainingDays || planData.frequency_per_week,
      duration_weeks: planData.duration_weeks || null,
      creator_id: userId,
      plan_type: 'custom',
      completed_sessions: 0,
      is_ai_generated: aiMeta?.isAiGenerated ?? false,
      ai_prompt: aiMeta?.aiPrompt ?? null,
      ai_model_version: aiMeta?.aiModelVersion ?? null,
      structure: structure as unknown as Json,
    };

    const { data, error } = await supabase
      .from('workout_plans')
      .insert(insert)
      .select(PLAN_COLUMNS)
      .single();

    if (error) {
      planLogger.error('Failed to create plan', { error: error.message });
      throw new Error(error.message);
    }

    planLogger.info('Created custom plan successfully', { planId: data.id });
    return { success: true, data };
  } catch (error) {
    planLogger.error('Error creating custom plan', { error: String(error) });
    return { success: false, error: String(error) };
  }
}
