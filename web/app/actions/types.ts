export type DietLogItem = {
  id: string;
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  logged_at: string;
  /** Client-only: row is an optimistic placeholder while AI parsing runs. */
  pending?: boolean;
};

export type WorkoutLogItem = {
  id: string;
  workout_name: string;
  sets: number | null;
  duration_minutes: number;
  calories_burned: number;
  logged_at: string;
  plan_id?: string | null;
  day_id?: string | null;
  /** Client-only: row is an optimistic placeholder while AI parsing runs. */
  pending?: boolean;
};

export type UserGoals = {
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
};

export type TodayStats = {
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  calories_burned: number;
  workout_duration: number;
  diet_logs: DietLogItem[];
  workout_logs: WorkoutLogItem[];
};

export type WeeklyTrendDay = {
  dateIso: string;          // 'YYYY-MM-DD'
  dayLabel: string;         // 'Mon'..'Sun'
  kcalIntake: number;
  kcalBurn: number;
  workoutMinutes: number;
  isToday: boolean;
};

export type WeeklyTrendData = {
  days: WeeklyTrendDay[];   // length 7, monday → sunday
  weekLabel: string;
  todayIndex: number;
  maxKcal: number;          // peak intake or burn across the week (for bar scaling)
};

export type TodayWorkoutInfo = {
  plan: { id: string; name: string } | null;
  todayDay: { id: string; name: string; isRestDay: boolean } | null;
  exercises: { id: string; text: string; exerciseName: string; sets?: number; repsMin?: number; repsMax?: number; weight?: number }[];
} | null;

export type DashboardData = {
  goals: UserGoals;
  today: TodayStats;
  weeklyTrend?: WeeklyTrendData;
  todayWorkout?: TodayWorkoutInfo;
};
