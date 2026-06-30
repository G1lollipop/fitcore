'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { authedUserId } from '@/lib/auth/require-user';
import { onboardingDataSchema, firstZodError } from '@/lib/validation/schemas';
import { ActionError } from '@/lib/errors';

type UserSettingsUpdate = Database['public']['Tables']['user_settings']['Update'];

/** Positive, finite target with a sane ceiling. */
const target = z.number().finite().min(0).max(100_000);

export type UpdateSettingsInput = z.infer<typeof onboardingDataSchema>;

/**
 * Persist the edited body profile from the Settings panel (gender / age /
 * height / weight / activity). Nutrition targets are no longer edited here —
 * they live in the "Diet plan" on the Plans tab (see `updateDietPlan`).
 */
export async function updateUserSettings(
  input: UpdateSettingsInput
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;

  const parsed = onboardingDataSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }
  const data = parsed.data;

  const update: UserSettingsUpdate = {
    gender: data.gender,
    age: data.age,
    height: data.height,
    weight: data.weight,
    activity_level: data.activityLevel,
  };

  const { error } = await supabase
    .from('user_settings')
    .update(update)
    .eq('user_id', userId);

  if (error) {
    console.error('[updateUserSettings] Supabase error:', error.message);
    return { success: false, error: ActionError.SAVE_FAILED };
  }

  revalidatePath('/');
  return { success: true };
}

const updateDietPlanSchema = z.object({
  targetCalories: target,
  targetProtein: target,
  targetCarbs: target,
  targetFat: target,
  // Daily water target in millilitres (250 ml .. 20 L).
  waterGoalMl: z.number().int().min(250).max(20_000),
});

export type UpdateDietPlanInput = z.infer<typeof updateDietPlanSchema>;

/**
 * Persist the user's "diet plan" — their daily nutrition targets + water goal.
 * Lives on the Plans tab; the AI coach can also recompute these from the
 * profile (see `calculateNutritionRecommendation`).
 */
export async function updateDietPlan(
  input: UpdateDietPlanInput
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;

  const parsed = updateDietPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }
  const data = parsed.data;

  const update: UserSettingsUpdate = {
    target_calories: Math.round(data.targetCalories),
    target_protein: Math.round(data.targetProtein),
    target_carbs: Math.round(data.targetCarbs),
    target_fat: Math.round(data.targetFat),
    water_goal: Math.round(data.waterGoalMl),
  };

  const { error } = await supabase
    .from('user_settings')
    .update(update)
    .eq('user_id', userId);

  if (error) {
    console.error('[updateDietPlan] Supabase error:', error.message);
    return { success: false, error: ActionError.SAVE_FAILED };
  }

  revalidatePath('/');
  return { success: true };
}
