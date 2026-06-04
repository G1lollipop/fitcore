'use server';

import { supabase } from '@/lib/supabaseClient';
import { Database } from '@/lib/database.types';
import { logger, createModuleLogger } from '@/lib/logger';

const exerciseLogger = createModuleLogger('ExerciseAPI');

export interface ExerciseFilters {
  category?: string
  muscleGroups?: string[]
  equipment?: string
  difficulty?: string
  search?: string
  isSystem?: boolean
  page?: number
  pageSize?: number
}

export interface PaginatedExercises {
  data: any[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

export async function getExercises(filters: ExerciseFilters = {}): Promise<{ success: boolean; data?: PaginatedExercises; error?: string }> {
  try {
    const page = filters.page || 1
    const pageSize = filters.pageSize || 10
    const offset = (page - 1) * pageSize

    exerciseLogger.info('获取动作列表', { filters, page, pageSize })

    let query = (supabase as any).from('exercises').select('*', { count: 'exact' })

    if (filters.category) {
      query = query.eq('category', filters.category)
    }

    if (filters.equipment) {
      query = query.eq('equipment', filters.equipment)
    }

    if (filters.difficulty) {
      query = query.eq('difficulty', filters.difficulty)
    }

    if (filters.isSystem !== undefined) {
      query = query.eq('is_system', filters.isSystem)
    }

    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,name_en.ilike.%${filters.search}%`)
    }

    if (filters.muscleGroups && filters.muscleGroups.length > 0) {
      query = query.overlaps('muscle_groups', filters.muscleGroups)
    }

    query = query.order('usage_count', { ascending: false })
    query = query.range(offset, offset + pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      exerciseLogger.error('获取动作列表失败', { error: error.message })
      logger.error('获取动作列表失败', { module: 'ExerciseAPI' }, { error })
      throw new Error(error.message)
    }

    const total = count || 0
    const totalPages = Math.ceil(total / pageSize)

    exerciseLogger.info('获取动作成功', { count: data?.length || 0, total, page, pageSize })

    return {
      success: true,
      data: {
        data: data || [],
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasMore: page < totalPages
        }
      }
    }
  } catch (error) {
    exerciseLogger.error('获取动作异常', { error: String(error) })
    return { success: false, error: String(error) }
  }
}

export async function getExerciseById(id: string) {
  try {
    exerciseLogger.info('获取单个动作', { exerciseId: id })

    const { data, error } = await (supabase as any)
      .from('exercises')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      exerciseLogger.error('获取动作失败', { error: error.message, exerciseId: id })
      throw new Error(error.message)
    }

    return { success: true, data }
  } catch (error) {
    exerciseLogger.error('获取动作异常', { error: String(error), exerciseId: id })
    return { success: false, error: String(error) }
  }
}

export async function getExerciseCategories() {
  try {
    const { data, error } = await (supabase as any)
      .from('exercises')
      .select('category')
      .order('category')

    if (error) throw new Error(error.message)

    const categories = [...new Set(data?.map((e: any) => e.category) || [])]
    return { success: true, data: categories }
  } catch (error) {
    exerciseLogger.error('获取动作分类失败', { error: String(error) })
    return { success: false, error: String(error) }
  }
}

export async function getMuscleGroups() {
  try {
    const { data, error } = await (supabase as any)
      .from('exercises')
      .select('muscle_groups')

    if (error) throw new Error(error.message)

    const allMuscleGroups = data?.flatMap((e: any) => e.muscle_groups) || []
    const muscleGroups = [...new Set(allMuscleGroups)]
    return { success: true, data: muscleGroups }
  } catch (error) {
    exerciseLogger.error('获取肌肉群失败', { error: String(error) })
    return { success: false, error: String(error) }
  }
}

export async function getEquipmentList() {
  try {
    const { data, error } = await (supabase as any)
      .from('exercises')
      .select('equipment')
      .order('equipment')

    if (error) throw new Error(error.message)

    const equipment = [...new Set(data?.map((e: any) => e.equipment) || [])]
    return { success: true, data: equipment }
  } catch (error) {
    exerciseLogger.error('获取器械列表失败', { error: String(error) })
    return { success: false, error: String(error) }
  }
}

export async function createExercise(
  exercise: {
    name: string
    name_en?: string | null
    category: string
    muscle_groups?: string[]
    muscle_group_details?: Record<string, unknown> | null
    equipment: string
    difficulty: string
    movement_pattern?: string | null
    plane?: string | null
    default_sets?: number | null
    default_reps_min?: number | null
    default_reps_max?: number | null
    default_rest_seconds?: number | null
    calories_per_minute?: number | null
    instructions?: string | null
    video_url?: string | null
    image_url?: string | null
  },
  userId: string
) {
  try {
    exerciseLogger.info('创建新动作', { userId, exerciseName: exercise.name })

    const { data, error } = await (supabase as any)
      .from('exercises')
      .insert({
        ...exercise,
        created_by: userId,
        is_system: false,
        is_ai_generated: false,
      })
      .select()
      .single()

    if (error) {
      exerciseLogger.error('创建动作失败', { error: error.message })
      throw new Error(error.message)
    }

    exerciseLogger.info('创建动作成功', { exerciseId: data.id })
    return { success: true, data }
  } catch (error) {
    exerciseLogger.error('创建动作异常', { error: String(error) })
    return { success: false, error: String(error) }
  }
}

export async function updateExercise(
  id: string,
  updates: Record<string, unknown>
) {
  try {
    exerciseLogger.info('更新动作', { exerciseId: id, updates })

    const { data, error } = await (supabase as any)
      .from('exercises')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      exerciseLogger.error('更新动作失败', { error: error.message, exerciseId: id })
      throw new Error(error.message)
    }

    exerciseLogger.info('更新动作成功', { exerciseId: id })
    return { success: true, data }
  } catch (error) {
    exerciseLogger.error('更新动作异常', { error: String(error), exerciseId: id })
    return { success: false, error: String(error) }
  }
}

export async function deleteExercise(id: string) {
  try {
    exerciseLogger.info('删除动作', { exerciseId: id })

    const { error } = await (supabase as any)
      .from('exercises')
      .delete()
      .eq('id', id)

    if (error) {
      exerciseLogger.error('删除动作失败', { error: error.message, exerciseId: id })
      throw new Error(error.message)
    }

    exerciseLogger.info('删除动作成功', { exerciseId: id })
    return { success: true }
  } catch (error) {
    exerciseLogger.error('删除动作异常', { error: String(error), exerciseId: id })
    return { success: false, error: String(error) }
  }
}

export async function incrementExerciseUsage(id: string) {
  try {
    const { data, error } = await (supabase as any)
      .from('exercises')
      .select('usage_count')
      .eq('id', id)
      .single()

    if (error) throw new Error(error.message)

    const newCount = (data.usage_count || 0) + 1

    const { error: updateError } = await (supabase as any)
      .from('exercises')
      .update({ 
        usage_count: newCount,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)

    if (updateError) {
      exerciseLogger.warn('增加使用次数失败', { error: updateError.message, exerciseId: id })
      return { success: false, error: updateError.message }
    }

    return { success: true }
  } catch (error) {
    exerciseLogger.error('增加使用次数异常', { error: String(error), exerciseId: id })
    return { success: false, error: String(error) }
  }
}
