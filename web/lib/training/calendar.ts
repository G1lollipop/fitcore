/**
 * Pure helper extracted from `components/training-history.tsx`.
 *
 * Generates a month grid (leading blanks + day cells) for a calendar view,
 * folding in any per-day workout aggregates the caller has fetched.
 *
 * The function is pure: same inputs → same output, no clock reads, no
 * Supabase, no React. Safe to memoize on (year, month, workoutData).
 */

export interface WorkoutLogLike {
  workout_name?: string | null
  duration_minutes?: number | null
  calories_burned?: number | null
}

export interface CalendarDay {
  /** 1..31 for actual days, or `null` for blank leading cells. */
  day: number | null
  /** ISO date string `YYYY-MM-DD`. Empty string for blank cells. */
  dateStr: string
  hasWorkout: boolean
  workoutCount: number
  totalDuration: number
  totalCalories: number
}

/** Format a Y/M/D triple as `YYYY-MM-DD` without timezone surprises. */
export function toDateString(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

/**
 * Build a Sunday-first calendar grid for the given month.
 *
 * @param month - any Date inside the target month
 * @param workoutData - map of `YYYY-MM-DD` → workout logs for that day
 */
export function generateCalendarDays(
  month: Date,
  workoutData: Record<string, WorkoutLogLike[]> = {}
): CalendarDay[] {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()

  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startDayOfWeek = firstDay.getDay() // 0 = Sun

  const days: CalendarDay[] = []

  // Leading blanks so the 1st lands on its real weekday column.
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({
      day: null,
      dateStr: '',
      hasWorkout: false,
      workoutCount: 0,
      totalDuration: 0,
      totalCalories: 0,
    })
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = toDateString(year, monthIndex, i)
    const workouts = workoutData[dateStr] ?? []
    const totalDuration = workouts.reduce((sum, w) => sum + (w.duration_minutes ?? 0), 0)
    const totalCalories = workouts.reduce((sum, w) => sum + (w.calories_burned ?? 0), 0)

    days.push({
      day: i,
      dateStr,
      hasWorkout: workouts.length > 0,
      workoutCount: workouts.length,
      totalDuration,
      totalCalories,
    })
  }

  return days
}

/**
 * Roll a month's worth of workout aggregates into a single summary.
 * Used by training history's monthly stats header.
 */
export function summarizeMonth(workoutData: Record<string, WorkoutLogLike[]>): {
  totalWorkouts: number
  totalDuration: number
  totalCalories: number
} {
  const all = Object.values(workoutData).flat()
  return {
    totalWorkouts: all.length,
    totalDuration: all.reduce((s, w) => s + (w.duration_minutes ?? 0), 0),
    totalCalories: all.reduce((s, w) => s + (w.calories_burned ?? 0), 0),
  }
}

export interface StreakInfo {
  /** Total days in the contiguous run that this date belongs to. */
  length: number
  /** 1-based position within the run (1 = first day, length = last day). */
  index: number
}

/**
 * Compute the consecutive-day streak each workout date belongs to.
 *
 * Two `YYYY-MM-DD` dates are considered consecutive iff they differ by
 * exactly one calendar day. Days without workouts break the chain.
 *
 * Output is keyed by `YYYY-MM-DD`; only dates with workouts are present.
 * `length` is the same for every date in the same run; `index` walks 1..length.
 */
export function computeStreaks(
  workoutData: Record<string, WorkoutLogLike[]>
): Record<string, StreakInfo> {
  const dates = Object.keys(workoutData)
    .filter((d) => (workoutData[d]?.length ?? 0) > 0)
    .sort()

  const out: Record<string, StreakInfo> = {}
  if (dates.length === 0) return out

  let runStartIdx = 0
  for (let i = 0; i < dates.length; i++) {
    const isLast = i === dates.length - 1
    const breaks =
      isLast || !areConsecutive(dates[i], dates[i + 1])

    if (breaks) {
      const runLength = i - runStartIdx + 1
      for (let j = 0; j < runLength; j++) {
        out[dates[runStartIdx + j]] = {
          length: runLength,
          index: j + 1,
        }
      }
      runStartIdx = i + 1
    }
  }

  return out
}

function areConsecutive(a: string, b: string): boolean {
  const da = new Date(`${a}T00:00:00`).getTime()
  const db = new Date(`${b}T00:00:00`).getTime()
  return Math.round((db - da) / 86400000) === 1
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'cardio'
  | 'other'

interface MuscleRule {
  group: MuscleGroup
  /** Lowercased substrings; any match attributes the workout to this group. */
  keywords: readonly string[]
}

// Order matters when a workout name matches multiple groups — earlier rules
// win. We keep specific compound moves (deadlift, squat) above generic ones.
const MUSCLE_RULES: readonly MuscleRule[] = [
  {
    group: 'legs',
    keywords: [
      '深蹲', '硬拉', '弓步', '腿举', '腿弯举', '腿屈伸', '臀推', '保加利亚',
      'squat', 'deadlift', 'lunge', 'leg press', 'leg curl', 'leg extension', 'hip thrust',
    ],
  },
  {
    group: 'back',
    keywords: [
      '划船', '引体', '高位下拉', '坐姿下拉', '背阔', 't杠',
      'row', 'pull-up', 'pullup', 'pull up', 'lat pulldown', 'pulldown',
    ],
  },
  {
    group: 'chest',
    keywords: [
      '卧推', '推胸', '飞鸟', '夹胸', '俯卧撑', '双杠臂屈伸',
      'bench press', 'chest press', 'push-up', 'pushup', 'push up', 'fly', 'dip',
    ],
  },
  {
    group: 'shoulders',
    keywords: [
      '肩推', '推举', '侧平举', '前平举', '后束', '耸肩', '阿诺德',
      'shoulder press', 'overhead press', 'lateral raise', 'front raise', 'rear delt', 'shrug',
    ],
  },
  {
    group: 'arms',
    keywords: [
      '弯举', '二头', '三头', '臂屈伸', '颈后臂屈伸', '锤式',
      'curl', 'biceps', 'triceps', 'tricep extension', 'hammer',
    ],
  },
  {
    group: 'core',
    keywords: [
      '卷腹', '腹肌', '平板支撑', '仰卧起坐', '俄罗斯转体', '悬垂举腿',
      'plank', 'crunch', 'abs', 'sit-up', 'situp', 'sit up', 'russian twist', 'leg raise',
    ],
  },
  {
    group: 'cardio',
    keywords: [
      '跑步', '慢跑', '快走', '跳绳', '骑行', '动感单车', '游泳', '划船机',
      '椭圆机', '爬山', '有氧',
      'run', 'jog', 'walk', 'cycling', 'bike', 'swim', 'jump rope', 'skipping', 'cardio', 'elliptical',
    ],
  },
] as const

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: '胸',
  back: '背',
  legs: '腿',
  shoulders: '肩',
  arms: '手臂',
  core: '核心',
  cardio: '有氧',
  other: '其他',
}

export function muscleLabel(group: MuscleGroup): string {
  return MUSCLE_LABELS[group]
}

/** Classify a single workout name into a muscle group. */
export function classifyMuscleGroup(name?: string | null): MuscleGroup {
  if (!name) return 'other'
  const lc = name.toLowerCase()
  for (const rule of MUSCLE_RULES) {
    for (const kw of rule.keywords) {
      if (lc.includes(kw)) return rule.group
    }
  }
  return 'other'
}

export interface MuscleGroupStat {
  group: MuscleGroup
  label: string
  /** Total minutes attributed to this group across the input. */
  minutes: number
  /** Number of logs attributed. */
  sessions: number
  /** 0..1 share of total minutes across populated groups. */
  share: number
}

/**
 * Roll up the month's logs into per-muscle-group totals, sorted by minutes
 * (desc). Empty groups are dropped. `share` is recomputed against the sum
 * of populated groups, so the top-N display always sums to ~1 visually.
 */
export function topMuscleGroups(
  workoutData: Record<string, WorkoutLogLike[]>,
  limit = 3
): MuscleGroupStat[] {
  const totals = new Map<MuscleGroup, { minutes: number; sessions: number }>()
  for (const logs of Object.values(workoutData)) {
    for (const log of logs ?? []) {
      const group = classifyMuscleGroup(log.workout_name)
      const cur = totals.get(group) ?? { minutes: 0, sessions: 0 }
      cur.minutes += log.duration_minutes ?? 0
      cur.sessions += 1
      totals.set(group, cur)
    }
  }

  const populated = Array.from(totals.entries())
    .filter(([, v]) => v.minutes > 0 || v.sessions > 0)
    .sort((a, b) => b[1].minutes - a[1].minutes)

  const totalMinutes = populated.reduce((s, [, v]) => s + v.minutes, 0)

  return populated.slice(0, limit).map(([group, v]) => ({
    group,
    label: MUSCLE_LABELS[group],
    minutes: v.minutes,
    sessions: v.sessions,
    share: totalMinutes > 0 ? v.minutes / totalMinutes : 0,
  }))
}
