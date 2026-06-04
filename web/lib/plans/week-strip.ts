/**
 * Map a workout plan onto a Monday-first 7-cell week strip.
 *
 * The plan's `workout_days` carry an optional 1..7 `day_order` (Mon..Sun).
 * `rest_days` is also 1..7. When `day_order` is missing or non-contiguous,
 * we fall back to placing the days into the first non-rest weekday slots
 * — matching the rotation logic in `lib/plans/today-workout.ts`.
 *
 * Pure: pass `now` for deterministic tests.
 */

export interface WeekStripDayInput {
  id: string
  name?: string | null
  day_order?: number | null
  focus_muscles?: string[] | null
}

export interface WeekStripPlanInput {
  workout_days?: WeekStripDayInput[] | null
  rest_days?: number[] | null
  frequency_per_week?: number | null
}

export type WeekStripCellKind = 'workout' | 'rest' | 'off'

export interface WeekStripCell {
  /** ISO weekday position 1..7 (1 = Mon, 7 = Sun). */
  position: number
  /** Localised single-character label: 一二三四五六日. */
  shortLabel: string
  kind: WeekStripCellKind
  isToday: boolean
  /** Populated when `kind === 'workout'`. */
  workoutDay?: WeekStripDayInput
}

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const

/** ISO weekday index 1..7 (Mon..Sun) for a JS Date. */
function isoWeekday(date: Date): number {
  const d = date.getDay()
  return d === 0 ? 7 : d
}

/**
 * Place workout_days into 7 weekday slots:
 * - Slots in `rest_days` → 'rest'
 * - First by `day_order` if present (1..7 weekday-mapped), else fill remaining
 *   non-rest slots in input order.
 * - Otherwise → 'off' (plan's frequency leaves the day unscheduled).
 */
export function buildWeekStrip(
  plan: WeekStripPlanInput | null | undefined,
  now: Date = new Date()
): WeekStripCell[] {
  const days = plan?.workout_days ?? []
  const restDays = new Set(plan?.rest_days ?? [])
  const todayPos = isoWeekday(now)

  // Try strict day_order placement first. If at least one day has a valid
  // 1..7 day_order that doesn't collide with a rest day, use that mapping;
  // otherwise fall back to sequential fill.
  const byOrder = new Map<number, WeekStripDayInput>()
  let hasValidOrder = false
  for (const d of days) {
    const o = d.day_order
    if (typeof o === 'number' && o >= 1 && o <= 7 && !restDays.has(o)) {
      // Avoid overwriting if the same slot is targeted twice.
      if (!byOrder.has(o)) {
        byOrder.set(o, d)
        hasValidOrder = true
      }
    }
  }

  if (!hasValidOrder && days.length > 0) {
    // Sequential fill of non-rest slots.
    const sorted = [...days].sort(
      (a, b) => (a.day_order ?? 0) - (b.day_order ?? 0)
    )
    let cursor = 0
    for (let pos = 1; pos <= 7 && cursor < sorted.length; pos++) {
      if (restDays.has(pos)) continue
      byOrder.set(pos, sorted[cursor]!)
      cursor++
    }
  }

  const cells: WeekStripCell[] = []
  for (let pos = 1; pos <= 7; pos++) {
    const isRest = restDays.has(pos)
    const wd = byOrder.get(pos)
    let kind: WeekStripCellKind = 'off'
    if (isRest) kind = 'rest'
    else if (wd) kind = 'workout'

    cells.push({
      position: pos,
      shortLabel: DAY_LABELS[pos - 1],
      kind,
      isToday: pos === todayPos,
      workoutDay: wd,
    })
  }
  return cells
}

/**
 * Find the cell representing today's session in a built week strip.
 * Returns null if today is rest/off or the strip is empty.
 */
export function findTodayCell(cells: WeekStripCell[]): WeekStripCell | null {
  for (const cell of cells) {
    if (cell.isToday && cell.kind === 'workout') return cell
  }
  return null
}
