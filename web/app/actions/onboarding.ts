'use server';

import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { openai } from '@/lib/openaiClient';
import { AI_FAST_MODEL } from '@/lib/ai/model';

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
  sedentary: '久坐（几乎不运动）',
  light: '轻度活动（每周运动1-3天）',
  moderate: '中度活动（每周运动3-5天）',
  heavy: '重度活动（每周运动6-7天）',
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
  try {
    const bmr = calculateBMR(data.gender, data.age, data.height, data.weight);
    const tdee = calculateTDEE(bmr, data.activityLevel);
    const macros = calculateMacros(tdee);

    const genderText = data.gender === 'male' ? '男性' : '女性';
    const activityText = ACTIVITY_LABELS[data.activityLevel];

    const prompt = `你是一位专业的营养师和健身教练。请根据以下用户信息，给出一段简短（100字以内）的个性化营养建议。

用户信息：
- 性别：${genderText}
- 年龄：${data.age}岁
- 身高：${data.height}cm
- 体重：${data.weight}kg
- 活动水平：${activityText}
- 基础代谢率(BMR)：${Math.round(bmr)} kcal
- 每日总能量消耗(TDEE)：${tdee} kcal

建议要求：
1. 简洁友好，使用中文
2. 可以包含一个小的健身建议或鼓励
3. 不要重复列出数据，直接给建议`;

    const response = await openai.chat.completions.create({
      model: AI_FAST_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 200,
    });

    const aiAdvice = response.choices[0]?.message?.content || '保持健康的生活方式，均衡饮食，适量运动！';

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
        aiAdvice: '根据您的身体数据，我们为您制定了个性化的营养目标。坚持记录，保持健康！',
      },
    };
  }
}

export async function saveOnboardingData(
  userId: string,
  data: OnboardingData,
  recommendation: NutritionRecommendation
): Promise<{ success: boolean; error?: string }> {
  if (!userId) {
    return { success: false, error: '用户未登录' };
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
      // @ts-ignore - Supabase types issue
      .upsert(insertData, { onConflict: 'user_id' });

    if (error) {
      console.error('[saveOnboardingData] Supabase error:', error);
      return { success: false, error: `保存失败: ${error.message}` };
    }

    return { success: true };
  } catch (error) {
    console.error('[saveOnboardingData] Error:', error);
    return { success: false, error: '保存数据时发生错误' };
  }
}

export async function checkUserOnboarded(userId: string): Promise<boolean> {
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

export async function getUserSettings(userId: string): Promise<UserSettingsRow | null> {
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
