/**
 * Map a JSON plan structure onto a Monday-first 7-cell week strip.
 *
 * Plans store a fixed 7-element `days` array (Mon → Sun), so the strip is a
 * direct 1:1 mapping: each cell is a workout or rest day. Pure: pass `now` for
 * deterministic tests.
 */

import { normalizePlanStructure, type PlanDay } from './types'

export type WeekStripCellKind = 'workout' | 'rest'

export interface WeekStripCell {
  /** ISO weekday position 1..7 (1 = Mon, 7 = Sun). */
  position: number
  kind: WeekStripCellKind
  isToday: boolean
  day: PlanDay
}

/** ISO weekday index 1..7 (Mon..Sun) for a JS Date. */
function isoWeekday(date: Date): number {
  const d = date.getDay()
  return d === 0 ? 7 : d
}

export function buildWeekStrip(
  structure: unknown,
  now: Date = new Date()
): WeekStripCell[] {
  const { days } = normalizePlanStructure(structure)
  const todayPos = isoWeekday(now)
  return days.map((day, i) => ({
    position: i + 1,
    kind: day.rest_day || day.exercises.length === 0 ? 'rest' : 'workout',
    isToday: i + 1 === todayPos,
    day,
  }))
}

/**
 * Find the cell representing today's session in a built week strip.
 * Returns null if today is a rest day or the strip is empty.
 */
export function findTodayCell(cells: WeekStripCell[]): WeekStripCell | null {
  return cells.find((cell) => cell.isToday && cell.kind === 'workout') ?? null
}
