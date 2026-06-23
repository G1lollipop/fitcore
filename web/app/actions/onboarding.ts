'use server';

import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { openai } from '@/lib/openaiClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';
import { authedUserId, getUserIdOrNull } from '@/lib/auth/require-user';
import {
  onboardingDataSchema,
  nutritionRecommendationSchema,
  firstZodError,
} from '@/lib/validation/schemas';
import { ActionError } from '@/lib/errors';

type UserSettingsInsert = Database['public']['Tables']['user_settings']['Insert'];

export interface OnboardingData {
  gender: 'male' | 'female';
  age: number;
  height: number;
  weight: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'heavy';
}

export interface NutritionRecommendation {
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  bmr: number;
  tdee: number;
  aiAdvice: string;
}

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  heavy: 1.725,
};

const ACTIVITY_LABELS = {
  sedentary: 'Sedentary (little to no exercise)',
  light: 'Lightly active (exercise 1-3 days/week)',
  moderate: 'Moderately active (exercise 3-5 days/week)',
  heavy: 'Very active (exercise 6-7 days/week)',
};

function calculateBMR(gender: 'male' | 'female', age: number, height: number, weight: number): number {
  if (gender === 'male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
}

function calculateTDEE(bmr: number, activityLevel: keyof typeof ACTIVITY_MULTIPLIERS): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

function calculateMacros(tdee: number): { protein: number; carbs: number; fat: number } {
  const protein = Math.round((tdee * 0.25) / 4);
  const fat = Math.round((tdee * 0.25) / 9);
  const carbs = Math.round((tdee * 0.50) / 4);
  return { protein, carbs, fat };
}

export async function calculateNutritionRecommendation(
  data: OnboardingData
): Promise<{ success: boolean; recommendation?: NutritionRecommendation; error?: string }> {
  const parsed = onboardingDataSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }
  try {
    const bmr = calculateBMR(data.gender, data.age, data.height, data.weight);
    const tdee = calculateTDEE(bmr, data.activityLevel);
    const macros = calculateMacros(tdee);

    const prompt = `You are a professional nutritionist and fitness coach. Based on the user info below, give a short (under 60 words) personalized nutrition tip.

User info:
- Gender: ${data.gender === 'male' ? 'Male' : 'Female'}
- Age: ${data.age}
- Height: ${data.height} cm
- Weight: ${data.weight} kg
- Activity level: ${ACTIVITY_LABELS[data.activityLevel]}
- BMR: ${Math.round(bmr)} kcal
- TDEE: ${tdee} kcal

Requirements:
1. Concise and friendly, in English
2. You may include a small fitness tip or encouragement
3. Don't restate the numbers — give advice directly`;

    const response = await openai.chat.completions.create({
      model: AI_FAST_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 200,
    });

    const aiAdvice =
      response.choices[0]?.message?.content ||
      'Maintain a healthy lifestyle with balanced nutrition and regular exercise!';

    return {
      success: true,
      recommendation: {
        targetCalories: tdee,
        targetProtein: macros.protein,
        targetCarbs: macros.carbs,
        targetFat: macros.fat,
        bmr: Math.round(bmr),
        tdee,
        aiAdvice,
      },
    };
  } catch (error) {
    console.error('[calculateNutritionRecommendation] Error:', error);
    const bmr = calculateBMR(data.gender, data.age, data.height, data.weight);
    const tdee = calculateTDEE(bmr, data.activityLevel);
    const macros = calculateMacros(tdee);

    return {
      success: true,
      recommendation: {
        targetCalories: tdee,
        targetProtein: macros.protein,
        targetCarbs: macros.carbs,
        targetFat: macros.fat,
        bmr: Math.round(bmr),
        tdee,
        aiAdvice:
          'Based on your body data, we tailored personalized nutrition goals for you. Keep logging and stay healthy!',
      },
    };
  }
}

export async function saveOnboardingData(
  data: OnboardingData,
  recommendation: NutritionRecommendation
): Promise<{ success: boolean; error?: string }> {
  const a = await authedUserId();
  if (!a.ok) return a.result;
  const userId = a.userId;

  const parsedData = onboardingDataSchema.safeParse(data);
  if (!parsedData.success) {
    return { success: false, error: firstZodError(parsedData.error) };
  }
  const parsedRec = nutritionRecommendationSchema.safeParse(recommendation);
  if (!parsedRec.success) {
    return { success: false, error: firstZodError(parsedRec.error) };
  }

  try {
    const insertData: UserSettingsInsert = {
      user_id: userId,
      gender: data.gender,
      age: data.age,
      height: data.height,
      weight: data.weight,
      activity_level: data.activityLevel,
      target_calories: recommendation.targetCalories,
      target_protein: recommendation.targetProtein,
      target_carbs: recommendation.targetCarbs,
      target_fat: recommendation.targetFat,
    };

    const { error } = await supabase
      .from('user_settings')
      .upsert(insertData, { onConflict: 'user_id' });

    if (error) {
      console.error('[saveOnboardingData] Supabase error:', error);
      return { success: false, error: ActionError.SAVE_FAILED };
    }

    return { success: true };
  } catch (error) {
    console.error('[saveOnboardingData] Error:', error);
    return { success: false, error: ActionError.SAVE_FAILED };
  }
}

export async function checkUserOnboarded(): Promise<boolean> {
  const userId = await getUserIdOrNull();
  if (!userId) return false;

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (error) {
      return false;
    }

    return !!data;
  } catch {
    return false;
  }
}

type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];

export async function getUserSettings(): Promise<UserSettingsRow | null> {
  const userId = await getUserIdOrNull();
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      return null;
    }

    return data as UserSettingsRow;
  } catch {
    return null;
  }
}
