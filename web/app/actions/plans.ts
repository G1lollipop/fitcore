'use server';

import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { logger, createModuleLogger } from '@/lib/logger';

const planLogger = createModuleLogger('PlanAPI');

export async function getUserPlansLight(userId: string) {
  try {
    planLogger.info('获取用户创建的计划（轻量）', { userId });

    const { data, error } = await (supabase as any)
      .from('workout_plans')
      .select(`
        id,
        name,
        description,
        goal,
        experience_level,
        frequency_per_week,
        duration_weeks,
        completed_sessions,
        rest_days,
        plan_type,
        source_template_id,
        created_at,
        workout_days (
          id,
          name,
          day_order,
          plan_exercises (
            id,
            exercise_id,
            order_index,
            target_sets,
            target_reps_min,
            target_reps_max,
            target_weight_kg,
            rest_seconds,
            notes,
            exercises (
              id,
              name,
              category,
              muscle_groups,
              equipment,
              difficulty
            )
          )
        )
      `)
      .eq('creator_id', userId)
      .is('source_template_id', null)
      .order('created_at', { ascending: false });

    if (error) {
      planLogger.error('获取用户计划失败', { error: error.message, userId });
      throw new Error(error.message);
    }

    planLogger.info('获取用户计划成功', { count: data?.length || 0, userId });
    return { success: true, data };
  } catch (error) {
    planLogger.error('获取用户计划异常', { error: String(error), userId });
    return { success: false, error: String(error) };
  }
}

export async function getSubscribedPlansLight(userId: string) {
  try {
    planLogger.info('获取用户订阅的计划（轻量）', { userId });

    const { data, error } = await (supabase as any)
      .from('workout_plans')
      .select(`
        id,
        name,
        description,
        goal,
        experience_level,
        frequency_per_week,
        duration_weeks,
        completed_sessions,
        rest_days,
        plan_type,
        source_template_id,
        created_at,
        workout_days (
          id,
          name,
          day_order
        )
      `)
      .eq('creator_id', userId)
      .not('source_template_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      planLogger.error('获取订阅计划失败', { error: error.message, userId });
      throw new Error(error.message);
    }

    planLogger.info('获取订阅计划成功', { count: data?.length || 0, userId });
    return { success: true, data };
  } catch (error) {
    planLogger.error('获取订阅计划异常', { error: String(error), userId });
    return { success: false, error: String(error) };
  }
}

export async function getCurrentPlanLight(userId: string) {
  try {
    planLogger.info('获取用户当前计划（轻量）', { userId });

    const { data: settingsWithPlan, error } = await (supabase as any)
      .from('user_settings')
      .select(`
        current_plan_id,
        current_plan_start_date,
        workout_plans!current_plan_id (
          id,
          name,
          description,
          goal,
          experience_level,
          frequency_per_week,
          duration_weeks,
          completed_sessions,
          rest_days,
          plan_type,
          workout_days (
            id,
            name,
            day_order
          )
        )
      `)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      planLogger.warn('获取用户设置失败', { error: error.message });
    }

    if (!settingsWithPlan?.current_plan_id || !settingsWithPlan?.workout_plans) {
      return { success: true, data: null };
    }

    return { 
      success: true, 
      data: { 
        plan: settingsWithPlan.workout_plans, 
        startDate: settingsWithPlan.current_plan_start_date 
      } 
    };
  } catch (error) {
    planLogger.error('获取当前计划异常', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function getSystemTemplatesLight() {
  try {
    planLogger.info('获取系统模板（轻量）');

    const { data, error } = await (supabase as any)
      .from('workout_plans')
      .select(`
        id,
        name,
        description,
        goal,
        experience_level,
        frequency_per_week,
        duration_weeks,
        rest_days,
        plan_type,
        workout_days (
          id,
          name,
          day_order
        )
      `)
      .eq('plan_type', 'system_template')
      .order('created_at', { ascending: true });

    if (error) {
      planLogger.error('获取系统模板失败', { error: error.message });
      throw new Error(error.message);
    }

    planLogger.info('获取系统模板成功', { count: data?.length || 0 });
    return { success: true, data };
  } catch (error) {
    planLogger.error('获取系统模板异常', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function getSystemTemplates() {
  try {
    planLogger.info('获取系统模板');

    const { data, error } = await (supabase as any)
      .from('workout_plans')
      .select(`
        *,
        workout_days (
          *,
          plan_exercises (
            *,
            exercises (*)
          )
        )
      `)
      .eq('plan_type', 'system_template')
      .order('created_at', { ascending: true });

    if (error) {
      planLogger.error('获取系统模板失败', { error: error.message });
      throw new Error(error.message);
    }

    planLogger.info('获取系统模板成功', { count: data?.length || 0 });
    return { success: true, data };
  } catch (error) {
    planLogger.error('获取系统模板异常', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function getUserPlans(userId: string) {
  try {
    planLogger.info('获取用户创建的计划', { userId });

    const { data, error } = await (supabase as any)
      .from('workout_plans')
      .select(`
        *,
        workout_days (
          *,
          plan_exercises (
            *,
            exercises (*)
          )
        )
      `)
      .eq('creator_id', userId)
      .is('source_template_id', null)
      .order('created_at', { ascending: false });

    if (error) {
      planLogger.error('获取用户计划失败', { error: error.message, userId });
      throw new Error(error.message);
    }

    planLogger.info('获取用户计划成功', { count: data?.length || 0, userId });
    return { success: true, data };
  } catch (error) {
    planLogger.error('获取用户计划异常', { error: String(error), userId });
    return { success: false, error: String(error) };
  }
}

export async function getSubscribedPlans(userId: string) {
  try {
    planLogger.info('获取用户订阅的计划', { userId });

    const { data, error } = await (supabase as any)
      .from('workout_plans')
      .select(`
        *,
        workout_days (
          *,
          plan_exercises (
            *,
            exercises (*)
          )
        )
      `)
      .eq('creator_id', userId)
      .not('source_template_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      planLogger.error('获取订阅计划失败', { error: error.message, userId });
      throw new Error(error.message);
    }

    planLogger.info('获取订阅计划成功', { count: data?.length || 0, userId });
    return { success: true, data };
  } catch (error) {
    planLogger.error('获取订阅计划异常', { error: String(error), userId });
    return { success: false, error: String(error) };
  }
}

export async function getCurrentPlan(userId: string) {
  try {
    planLogger.info('获取用户当前计划', { userId });

    const { data: settingsWithPlan, error } = await (supabase as any)
      .from('user_settings')
      .select(`
        current_plan_id,
        current_plan_start_date,
        workout_plans!current_plan_id (
          *,
          workout_days (
            *,
            plan_exercises (
              *,
              exercises (*)
            )
          )
        )
      `)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      planLogger.warn('获取用户设置失败', { error: error.message });
    }

    if (!settingsWithPlan?.current_plan_id || !settingsWithPlan?.workout_plans) {
      return { success: true, data: null };
    }

    return { 
      success: true, 
      data: { 
        plan: settingsWithPlan.workout_plans, 
        startDate: settingsWithPlan.current_plan_start_date 
      } 
    };
  } catch (error) {
    planLogger.error('获取当前计划异常', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function getPlanById(planId: string) {
  try {
    planLogger.info('获取计划详情', { planId });

    const { data, error } = await (supabase as any)
      .from('workout_plans')
      .select(`
        *,
        workout_days (
          *,
          plan_exercises (
            *,
            exercises (*)
          )
        )
      `)
      .eq('id', planId)
      .single();

    if (error) {
      planLogger.error('获取计划详情失败', { error: error.message, planId });
      throw new Error(error.message);
    }

    return { success: true, data };
  } catch (error) {
    planLogger.error('获取计划详情异常', { error: String(error), planId });
    return { success: false, error: String(error) };
  }
}

export async function createPlan(
  plan: {
    name: string
    description?: string | null
    goal?: string | null
    experience_level?: string | null
    frequency_per_week: number
    duration_weeks?: number | null
    time_per_session_minutes?: number | null
    is_template?: boolean
  },
  userId: string
) {
  try {
    planLogger.info('创建计划', { userId, planName: plan.name });

    const { data, error } = await (supabase as any)
      .from('workout_plans')
      .insert({
        ...plan,
        creator_id: userId,
        completed_sessions: 0,
      })
      .select()
      .single();

    if (error) {
      planLogger.error('创建计划失败', { error: error.message });
      throw new Error(error.message);
    }

    planLogger.info('创建计划成功', { planId: data.id });
    return { success: true, data };
  } catch (error) {
    planLogger.error('创建计划异常', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function updatePlan(
  planId: string,
  updates: Record<string, unknown>
) {
  try {
    planLogger.info('更新计划', { planId, updates });

    const { data, error } = await (supabase as any)
      .from('workout_plans')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .select()
      .single();

    if (error) {
      planLogger.error('更新计划失败', { error: error.message, planId });
      throw new Error(error.message);
    }

    planLogger.info('更新计划成功', { planId });
    return { success: true, data };
  } catch (error) {
    planLogger.error('更新计划异常', { error: String(error), planId });
    return { success: false, error: String(error) };
  }
}

export async function deletePlan(planId: string) {
  try {
    planLogger.info('删除计划', { planId });

    const { error } = await (supabase as any)
      .from('workout_plans')
      .delete()
      .eq('id', planId);

    if (error) {
      planLogger.error('删除计划失败', { error: error.message, planId });
      throw new Error(error.message);
    }

    planLogger.info('删除计划成功', { planId });
    return { success: true };
  } catch (error) {
    planLogger.error('删除计划异常', { error: String(error), planId });
    return { success: false, error: String(error) };
  }
}

export async function setCurrentPlan(userId: string, planId: string) {
  try {
    planLogger.info('设置当前计划', { userId, planId });

    const today = new Date().toISOString().split('T')[0];

    const { data: settings, error: fetchError } = await (supabase as any)
      .from('user_settings')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      planLogger.error('获取用户设置失败', { error: fetchError.message });
      throw new Error(fetchError.message);
    }

    if (settings) {
      const { error: updateError } = await (supabase as any)
        .from('user_settings')
        .update({
          current_plan_id: planId,
          current_plan_start_date: today,
        })
        .eq('user_id', userId);

      if (updateError) {
        planLogger.error('更新用户设置失败', { error: updateError.message });
        throw new Error(updateError.message);
      }
    } else {
      const { error: insertError } = await (supabase as any)
        .from('user_settings')
        .insert({
          user_id: userId,
          current_plan_id: planId,
          current_plan_start_date: today,
          target_calories: 2500,
          target_protein: 150,
          target_carbs: 300,
          target_fat: 80,
        });

      if (insertError) {
        planLogger.error('创建用户设置失败', { error: insertError.message });
        throw new Error(insertError.message);
      }
    }

    planLogger.info('设置当前计划成功', { userId, planId });
    return { success: true };
  } catch (error) {
    planLogger.error('设置当前计划异常', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function copyTemplateToUser(
  templateId: string,
  userId: string,
  newPlanName?: string
) {
  try {
    planLogger.info('复制模板到用户计划', { templateId, userId });

    const { data: template, error: fetchError } = await (supabase as any)
      .from('workout_plans')
      .select('*')
      .eq('id', templateId)
      .single();

    if (fetchError || !template) {
      planLogger.error('获取模板失败', { error: fetchError?.message, templateId });
      throw new Error(fetchError?.message || 'Template not found');
    }

    const { data: newPlan, error: createError } = await (supabase as any)
      .from('workout_plans')
      .insert({
        name: newPlanName || template.name,
        description: template.description,
        goal: template.goal,
        experience_level: template.experience_level,
        frequency_per_week: template.frequency_per_week,
        duration_weeks: template.duration_weeks,
        time_per_session_minutes: template.time_per_session_minutes,
        rest_days: template.rest_days,
        source_template_id: templateId,
        creator_id: userId,
        plan_type: 'custom',
        completed_sessions: 0,
      })
      .select()
      .single();

    if (createError) {
      planLogger.error('复制计划失败', { error: createError.message });
      throw new Error(createError.message);
    }

    const { data: templateDays, error: daysError } = await (supabase as any)
      .from('workout_days')
      .select(`
        *,
        plan_exercises (*)
      `)
      .eq('plan_id', templateId)
      .order('day_order');

    if (daysError) {
      planLogger.warn('获取模板训练日失败', { error: daysError.message });
    }

    if (templateDays && templateDays.length > 0) {
      const daysToInsert = templateDays.map((day: any) => ({
        plan_id: newPlan.id,
        name: day.name,
        day_order: day.day_order,
        focus_muscles: day.focus_muscles,
        day_type: day.day_type,
        estimated_duration_minutes: day.estimated_duration_minutes,
      }));

      const { data: insertedDays, error: batchInsertError } = await (supabase as any)
        .from('workout_days')
        .insert(daysToInsert)
        .select();

      if (batchInsertError) {
        planLogger.warn('批量插入训练日失败', { error: batchInsertError.message });
      } else if (insertedDays && insertedDays.length > 0) {
        const allExercises: any[] = [];
        
        insertedDays.forEach((newDay: any, index: number) => {
          const originalDay = templateDays[index];
          if (originalDay.plan_exercises && originalDay.plan_exercises.length > 0) {
            originalDay.plan_exercises.forEach((pe: any) => {
              allExercises.push({
                day_id: newDay.id,
                exercise_id: pe.exercise_id,
                order_index: pe.order_index,
                target_sets: pe.target_sets,
                target_reps_min: pe.target_reps_min,
                target_reps_max: pe.target_reps_max,
                target_weight_kg: pe.target_weight_kg,
                rest_seconds: pe.rest_seconds,
                notes: pe.notes,
              });
            });
          }
        });

        if (allExercises.length > 0) {
          const { error: exercisesError } = await (supabase as any)
            .from('plan_exercises')
            .insert(allExercises);

          if (exercisesError) {
            planLogger.warn('批量插入训练动作失败', { error: exercisesError.message });
          }
        }
      }
    }

    await setCurrentPlan(userId, newPlan.id);

    planLogger.info('复制模板成功', { newPlanId: newPlan.id });
    
    const { data: fullPlan, error: fullPlanError } = await (supabase as any)
      .from('workout_plans')
      .select(`
        *,
        workout_days (
          *,
          plan_exercises (
            *,
            exercises (*)
          )
        )
      `)
      .eq('id', newPlan.id)
      .single();
    
    if (fullPlanError) {
      planLogger.warn('获取完整计划数据失败', { error: fullPlanError.message });
      return { success: true, data: newPlan };
    }
    
    return { success: true, data: fullPlan || newPlan };
  } catch (error) {
    planLogger.error('复制模板异常', { error: String(error), templateId, userId });
    return { success: false, error: String(error) };
  }
}

export interface CustomPlanDay {
  name: string;
  focus_muscles?: string[];
  rest_day?: boolean;
  exercises: {
    exercise_id: string;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    target_weight_kg?: number;
  }[];
}

export async function createCustomPlan(
  userId: string,
  planData: {
    name: string;
    description?: string;
    goal?: string;
    experience_level?: string;
    frequency_per_week: number;
    duration_weeks?: number;
    days: CustomPlanDay[];
  }
) {
  try {
    planLogger.info('创建自定义计划', { userId, planName: planData.name });

    const restDays = planData.days
      .map((day, index) => (day.rest_day ? index + 1 : null))
      .filter((d): d is number => d !== null);

    const { data: newPlan, error: createError } = await (supabase as any)
      .from('workout_plans')
      .insert({
        name: planData.name,
        description: planData.description || null,
        goal: planData.goal || 'general',
        experience_level: planData.experience_level || 'beginner',
        frequency_per_week: planData.frequency_per_week,
        duration_weeks: planData.duration_weeks || null,
        rest_days: restDays,
        creator_id: userId,
        plan_type: 'custom',
        completed_sessions: 0,
      })
      .select()
      .single();

    if (createError) {
      planLogger.error('创建计划失败', { error: createError.message });
      throw new Error(createError.message);
    }

    const daysToInsert: any[] = [];
    const dayExercisesMap: Map<number, any[]> = new Map();

    for (let i = 0; i < planData.days.length; i++) {
      const day = planData.days[i];
      const actualDayOrder = i + 1;  // 1-7 对应周一到周日
      
      if (day.rest_day) {
        continue;
      }
      
      daysToInsert.push({
        plan_id: newPlan.id,
        name: day.name,
        day_order: actualDayOrder,  // 保持与 rest_days 一致的顺序（1-7）
        focus_muscles: day.focus_muscles || [],
        day_type: 'strength',  // 使用数据库允许的枚举值
      });

      if (day.exercises && day.exercises.length > 0) {
        dayExercisesMap.set(actualDayOrder, day.exercises.map((ex, exIndex) => ({
          exercise_id: ex.exercise_id,
          order_index: exIndex + 1,
          target_sets: ex.target_sets,
          target_reps_min: ex.target_reps_min,
          target_reps_max: ex.target_reps_max,
          target_weight_kg: ex.target_weight_kg || null,
        })));
      }
    }

    if (daysToInsert.length > 0) {
      planLogger.info('准备插入训练日', { count: daysToInsert.length, days: daysToInsert.map(d => ({ name: d.name, day_order: d.day_order })) });
      
      const { data: insertedDays, error: batchInsertError } = await (supabase as any)
        .from('workout_days')
        .insert(daysToInsert)
        .select();

      if (batchInsertError) {
        planLogger.error('批量创建训练日失败', { error: batchInsertError.message });
      } else {
        planLogger.info('训练日插入成功', { count: insertedDays?.length, insertedDays: insertedDays?.map((d: any) => ({ id: d.id, name: d.name, day_order: d.day_order })) });
        
        if (insertedDays && insertedDays.length > 0) {
          const allExercises: any[] = [];

          insertedDays.forEach((insertedDay: any) => {
            const exercises = dayExercisesMap.get(insertedDay.day_order);
            if (exercises) {
              planLogger.info('为训练日添加动作', { dayId: insertedDay.id, day_order: insertedDay.day_order, exerciseCount: exercises.length });
              exercises.forEach((ex) => {
                allExercises.push({
                  day_id: insertedDay.id,
                  ...ex,
                });
              });
            } else {
              planLogger.warn('训练日未找到对应动作', { dayId: insertedDay.id, day_order: insertedDay.day_order, availableDayOrders: Array.from(dayExercisesMap.keys()) });
            }
          });

          if (allExercises.length > 0) {
            planLogger.info('准备插入动作', { count: allExercises.length });
            const { error: exercisesError } = await (supabase as any)
              .from('plan_exercises')
              .insert(allExercises);

            if (exercisesError) {
              planLogger.error('批量添加动作失败', { error: exercisesError.message });
            } else {
              planLogger.info('批量添加动作成功', { count: allExercises.length });
            }
          }
        }
      }
    }

    planLogger.info('创建自定义计划成功', { planId: newPlan.id, dayCount: planData.days.length });
    
    const { data: fullPlan, error: fullPlanError } = await (supabase as any)
      .from('workout_plans')
      .select(`
        *,
        workout_days (
          *,
          plan_exercises (
            *,
            exercises (*)
          )
        )
      `)
      .eq('id', newPlan.id)
      .single();
    
    if (fullPlanError) {
      planLogger.warn('获取完整计划数据失败', { error: fullPlanError.message });
      return { success: true, data: newPlan };
    }
    
    return { success: true, data: fullPlan || newPlan };
  } catch (error) {
    planLogger.error('创建自定义计划异常', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function getTodayWorkout(userId: string) {
  try {
    planLogger.info('获取今日训练', { userId });

    const { data: settingsWithPlan, error } = await (supabase as any)
      .from('user_settings')
      .select(`
        current_plan_start_date,
        workout_plans!current_plan_id (
          id,
          name,
          frequency_per_week,
          rest_days,
          workout_days (
            id,
            name,
            day_order,
            day_type,
            rest_day,
            focus_muscles,
            estimated_duration_minutes,
            plan_exercises (
              id,
              target_sets,
              target_reps_min,
              target_reps_max,
              target_weight_kg,
              exercises (
                id,
                name,
                category
              )
            )
          )
        )
      `)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      planLogger.warn('获取用户设置失败', { error: error.message });
    }

    if (!settingsWithPlan?.workout_plans) {
      planLogger.info('用户无当前计划', { userId });
      return { success: true, data: null };
    }

    const plan = settingsWithPlan.workout_plans;
    const days = plan.workout_days || [];
    
    if (days.length === 0) {
      return { success: true, data: { plan, todayDay: null, exercises: [] } };
    }

    const today = new Date();
    const dayOfWeek = today.getDay();
    const todayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const restDays: number[] = (plan as any).rest_days || [];
    
    const sortedDays = [...days].sort((a: any, b: any) => (a.day_order || 0) - (b.day_order || 0));
    
    let todayDay: any = null;
    let isRestDay = false;
    
    if (restDays.length > 0 && restDays.includes(todayIndex + 1)) {
      isRestDay = true;
      // 所有 workout_days 都是训练日，取第一个作为展示
      if (sortedDays.length > 0) {
        todayDay = {
          ...sortedDays[0],
          name: '休息日',
        };
      }
    } else {
      const workoutDayIndex = todayIndex;
      
      if (restDays.length > 0) {
        let adjustedIndex = 0;
        let dayCount = 0;
        
        for (let i = 0; i <= todayIndex; i++) {
          if (!restDays.includes(i + 1)) {
            dayCount++;
          }
        }
        
        adjustedIndex = (dayCount - 1) % sortedDays.length;
        if (adjustedIndex < 0) adjustedIndex = 0;
        
        todayDay = sortedDays[adjustedIndex] || sortedDays[0];
      } else {
        todayDay = sortedDays.find((d: any) => d.day_order === todayIndex + 1) || sortedDays[todayIndex % sortedDays.length];
      }
    }

    if (!todayDay) {
      todayDay = sortedDays[0];
    }

    const exercises = (todayDay?.plan_exercises || []).map((pe: any) => {
      const sets = pe.target_sets || 0;
      const repsMin = pe.target_reps_min;
      const repsMax = pe.target_reps_max;
      const weight = pe.target_weight_kg;
      
      let exerciseText = pe.exercises?.name || '未知动作';
      if (sets > 0) {
        exerciseText += ` ${sets}组`;
        if (repsMin && repsMax) {
          exerciseText += ` ${repsMin}-${repsMax}次`;
        } else if (repsMin) {
          exerciseText += ` ${repsMin}次`;
        }
        if (weight) {
          exerciseText += ` ${weight}kg`;
        }
      }
      
      return {
        id: pe.id,
        text: exerciseText,
        exerciseId: pe.exercises?.id,
        exerciseName: pe.exercises?.name,
        sets: pe.target_sets,
        repsMin: pe.target_reps_min,
        repsMax: pe.target_reps_max,
        weight: pe.target_weight_kg,
      };
    });

    planLogger.info('获取今日训练成功', { 
      planId: plan.id, 
      dayName: todayDay?.name, 
      exerciseCount: exercises.length,
      isRestDay,
      todayIndex,
    });

    return { 
      success: true, 
      data: { 
        plan: {
          id: plan.id,
          name: plan.name,
        },
        todayDay: {
          id: todayDay?.id,
          name: isRestDay ? '休息日' : todayDay?.name,
          dayOrder: todayDay?.day_order,
          isRestDay: isRestDay,
          focusMuscles: todayDay?.focus_muscles,
        },
        exercises: isRestDay ? [] : exercises,
        dayIndex: todayIndex + 1,
        totalDays: plan.frequency_per_week || sortedDays.length,
      } 
    };
  } catch (error) {
    planLogger.error('获取今日训练异常', { error: String(error) });
    return { success: false, error: String(error) };
  }
}
