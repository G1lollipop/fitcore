import { supabase } from "@/lib/supabaseClient"

import type { Database } from "@/lib/database.types"
import type { UserContextPayload } from "@/lib/ai/types"
import type { DietLogItem, WorkoutLogItem } from "@/app/actions/types"

type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"]
type DailyStatsRow = Database["public"]["Tables"]["daily_stats"]["Row"]

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0]
}

export async function buildUserContext(userId: string): Promise<UserContextPayload> {
  const today = getTodayDate()

  const [settingsResult, dailyStatsResult, foodLogsResult, workoutLogsResult] = await Promise.all([
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("daily_stats")
      .select("*")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("food_logs")
      .select("id, food_name, calories, protein, carbs, fat, logged_at")
      .eq("user_id", userId)
      .eq("date", today)
      .order("logged_at", { ascending: true }),
    supabase
      .from("workout_logs")
      .select("id, workout_name, sets, duration_minutes, calories_burned, plan_id, day_id, logged_at")
      .eq("user_id", userId)
      .eq("date", today)
      .order("logged_at", { ascending: true }),
  ])

  const settings = settingsResult.data as UserSettingsRow | null
  const dailyStats = dailyStatsResult.data as DailyStatsRow | null

  return {
    profile: {
      age: settings?.age ?? null,
      gender: settings?.gender ?? null,
      height: settings?.height ?? null,
      weight: settings?.weight ?? null,
      activityLevel: settings?.activity_level ?? null,
    },
    targets: {
      calories: settings?.target_calories ?? null,
      protein: settings?.target_protein ?? null,
      carbs: settings?.target_carbs ?? null,
      fat: settings?.target_fat ?? null,
    },
    today: {
      calories: dailyStats?.total_calories ?? null,
      protein: dailyStats?.total_protein ?? null,
      carbs: dailyStats?.total_carbs ?? null,
      fat: dailyStats?.total_fat ?? null,

      caloriesBurned: dailyStats?.calories_burned ?? null,
      workoutDuration: dailyStats?.workout_duration ?? null,
    },
    plan: {
      currentWorkoutPlan: settings?.current_workout_plan ?? null,
      currentPlanId: settings?.current_plan_id ?? null,
    },
    logs: {
      dietLogs: (foodLogsResult.data as DietLogItem[] | null) ?? [],
      workoutLogs: (workoutLogsResult.data as WorkoutLogItem[] | null) ?? [],
    },
  }
}
