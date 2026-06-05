import { z } from 'zod';

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
  food_name: z.string().trim().min(1, '食物名称不能为空').max(200, '食物名称过长'),
  calories: macro,
  protein: macro,
  carbs: macro,
  fat: macro,
  logged_at: z.string().max(64).optional(),
});

export const onboardingDataSchema = z.object({
  gender: z.enum(['male', 'female']),
  age: z.number().int('年龄必须为整数').min(1, '年龄不合理').max(120, '年龄不合理'),
  height: z.number().min(50, '身高不合理').max(260, '身高不合理'),
  weight: z.number().min(20, '体重不合理').max(400, '体重不合理'),
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
  name: z.string().trim().min(1, '计划名称不能为空').max(100, '计划名称过长'),
  frequency_per_week: z
    .number()
    .int('每周训练天数必须为整数')
    .min(1, '每周至少训练 1 天')
    .max(7, '每周最多训练 7 天'),
});

/** Pulls the first human-readable message out of a ZodError for the action's `error` field. */
export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? '参数校验失败';
}
