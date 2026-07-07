// web/app/actions/training.ts
'use server'

import { revalidatePath } from 'next/cache'
import { authedUserId } from '@/lib/auth/require-user'
import { supabase } from '@/lib/supabaseClient'
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats'

// NOTE: workout_set_logs table must be created in Supabase before this action works

interface FinishTrainingInput {
  planId: string
  dayId: string
  workoutName: string
  startedAt: string  // ISO
  exercises: {
    name: string
    completedSets: { setNumber: number; weightKg: number | null; reps: number | null }[]
  }[]
}

export async function finishTrainingSession(input: FinishTrainingInput) {
  const a = await authedUserId()
  if (!a.ok) return a.result
  const userId = a.userId

  // Compute totals
  const totalSets = input.exercises.reduce((sum, ex) => sum + ex.completedSets.length, 0)
  const totalWeight = input.exercises.reduce(
    (sum, ex) => sum + ex.completedSets.reduce((s, set) => s + ((set.weightKg ?? 0) * (set.reps ?? 0)), 0),
    0
  )
  const estimatedCalories = Math.round(totalWeight * 0.1) // rough estimate
  const durationMinutes = Math.round(
    (Date.now() - new Date(input.startedAt).getTime()) / 60000
  )

  // Insert summary workout_log row
  const { data: workoutLog, error } = await supabase
    .from('workout_logs')
    .insert({
      user_id: userId,
      date: new Date().toISOString().split('T')[0],
      workout_name: input.workoutName,
      sets: totalSets,
      duration_minutes: Math.max(durationMinutes, 1),
      calories_burned: estimatedCalories,
      plan_id: input.planId,
      day_id: input.dayId,
      logged_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !workoutLog) return { success: false, error: 'Failed to save workout' }

  // Batch-insert set logs
  const setLogs = input.exercises.flatMap((ex) =>
    ex.completedSets.map((set) => ({
      workout_log_id: workoutLog.id,
      exercise_name: ex.name,
      set_number: set.setNumber,
      weight_kg: set.weightKg,
      reps: set.reps,
      logged_at: new Date().toISOString(),
    }))
  )

  if (setLogs.length > 0) {
    await supabase.from('workout_set_logs').insert(setLogs)
  }

  const today = new Date().toISOString().split('T')[0]
  await recomputeDailyStats(userId, today)
  revalidatePath('/')

  return { success: true, workoutLogId: workoutLog.id }
}
