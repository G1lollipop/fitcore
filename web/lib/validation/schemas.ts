import { z } from 'zod';
import { ActionError } from '@/lib/errors';

/**
 * Input validation schemas for server actions that accept client-supplied
 * payloads (macros, onboarding profile, plan creation).
 *
 * These run on the server *after* authentication: even though the UI restricts
 * inputs, a server action is a public HTTP endpoint and must not trust the
 * client. Validation rejects out-of-range / malformed data before it reaches
 * the database.
 */

/** Non-negative, finite macro/quantity with a generous sanity ceiling. */
const macro = z.number().finite().min(0).max(100_000);

export const dietLogInputSchema = z.object({
  // id / logged_at are server-managed in some paths; keep them lenient.
  id: z.string().max(200).optional(),
  food_name: z
    .string()
    .trim()
    .min(1, ActionError.FOOD_NAME_REQUIRED)
    .max(200, ActionError.FOOD_NAME_TOO_LONG),
  calories: macro,
  protein: macro,
  carbs: macro,
  fat: macro,
  logged_at: z.string().max(64).optional(),
});

export const onboardingDataSchema = z.object({
  gender: z.enum(['male', 'female']),
  age: z
    .number()
    .int(ActionError.AGE_INVALID)
    .min(1, ActionError.AGE_INVALID)
    .max(120, ActionError.AGE_INVALID),
  height: z.number().min(50, ActionError.HEIGHT_INVALID).max(260, ActionError.HEIGHT_INVALID),
  weight: z.number().min(20, ActionError.WEIGHT_INVALID).max(400, ActionError.WEIGHT_INVALID),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'heavy']),
});

export const nutritionRecommendationSchema = z.object({
  targetCalories: macro,
  targetProtein: macro,
  targetCarbs: macro,
  targetFat: macro,
  bmr: macro,
  tdee: macro,
  aiAdvice: z.string().max(2000),
});

export const planMetaSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, ActionError.PLAN_NAME_REQUIRED)
    .max(100, ActionError.PLAN_NAME_TOO_LONG),
  frequency_per_week: z
    .number()
    .int(ActionError.FREQUENCY_INVALID)
    .min(1, ActionError.FREQUENCY_INVALID)
    .max(7, ActionError.FREQUENCY_INVALID),
});

/** Pulls the first error code out of a ZodError for the action's `error` field. */
export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? ActionError.VALIDATION_FAILED;
}
