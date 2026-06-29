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

const updateSettingsSchema = onboardingDataSchema.extend({
  targetCalories: target,
  targetProtein: target,
  targetCarbs: target,
  targetFat: target,
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/**
 * Persist edited profile + nutrition goals from the Settings panel.
 *
 * Unlike the onboarding "reassess" flow (which always recomputes targets from
 * the formula), this lets the user keep or manually override their macro goals,
 * so it writes whatever targets the form submits alongside the profile fields.
 */
export async function updateUserSettings(
  input: UpdateSettingsInput
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;

  const parsed = updateSettingsSchema.safeParse(input);
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
    target_calories: Math.round(data.targetCalories),
    target_protein: Math.round(data.targetProtein),
    target_carbs: Math.round(data.targetCarbs),
    target_fat: Math.round(data.targetFat),
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
