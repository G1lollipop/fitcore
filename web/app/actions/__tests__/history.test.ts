import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  userId: vi.fn(),
  tables: {} as Record<string, Record<string, unknown>[]>,
}))
vi.mock('@/lib/auth/require-user', () => ({ getUserIdOrNull: mocks.userId }))
vi.mock('@/lib/supabaseClient', () => {
  /** Just enough of the query builder: column filters over in-memory rows. */
  const query = (rows: Row[]) => {
    const filters: ((row: Row) => boolean)[] = []
    const run = () => rows.filter((row) => filters.every((keep) => keep(row)))
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value)
        return builder
      },
      gte: (column: string, value: string) => {
        filters.push((row) => String(row[column]) >= value)
        return builder
      },
      lte: (column: string, value: string) => {
        filters.push((row) => String(row[column]) <= value)
        return builder
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (result: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: run(), error: null }),
    }
    return builder
  }
  return { supabase: { from: (table: string) => query(mocks.tables[table] ?? []) } }
})

import { getNutritionByDate, getNutritionRange, getWorkoutHistory } from '../history'

// Rows as they were written while the app calendar was Asia/Shanghai. Each
// `logged_at` falls on a *different* day when read on the Chicago clock.
const legacyBreakfast = {
  id: 'food-1',
  user_id: 'user-1',
  date: '2026-07-08',
  food_name: 'Congee',
  calories: 300,
  protein: 10,
  carbs: 50,
  fat: 5,
  // 01:30 on the 8th in Shanghai — 12:30 on the 7th in Chicago.
  logged_at: '2026-07-07T17:30:00.000Z',
}
const legacyBackdatedLunch = {
  ...legacyBreakfast,
  id: 'food-2',
  date: '2026-07-05',
  food_name: 'Noodles',
  // Shanghai noon on the 5th — 23:00 on the 4th in Chicago.
  logged_at: '2026-07-05T04:00:00.000Z',
}
const legacyWorkout = {
  id: 'workout-1',
  user_id: 'user-1',
  date: '2026-07-08',
  workout_name: 'Morning run',
  sets: null,
  duration_minutes: 30,
  calories_burned: 250,
  plan_id: null,
  day_id: null,
  // 07:00 on the 8th in Shanghai — 18:00 on the 7th in Chicago.
  logged_at: '2026-07-07T23:00:00.000Z',
}

beforeEach(() => {
  mocks.userId.mockResolvedValue('user-1')
  mocks.tables.food_logs = [legacyBreakfast, legacyBackdatedLunch]
  mocks.tables.workout_logs = [legacyWorkout]
  mocks.tables.user_settings = []
})

describe('Record keeps existing entries on their assigned dates', () => {
  it('lists food logs under their stored date, not the day their timestamp reads in Chicago', async () => {
    const range = await getNutritionRange('2026-07-02', '2026-07-08')

    expect(Object.keys(range).sort()).toEqual([
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
    ])
    expect(range['2026-07-08'].dietLogs.map((log) => log.id)).toEqual(['food-1'])
    expect(range['2026-07-05'].dietLogs.map((log) => log.id)).toEqual(['food-2'])
    // Nothing moved to the day the instants fall on in the new zone.
    expect(range['2026-07-07'].dietLogs).toEqual([])
    expect(range['2026-07-04'].dietLogs).toEqual([])
    // The stored instant is passed through untouched (UTC).
    expect(range['2026-07-08'].dietLogs[0].logged_at).toBe('2026-07-07T17:30:00.000Z')
  })

  it('returns a single day by its stored date', async () => {
    expect((await getNutritionByDate('2026-07-08')).dietLogs.map((log) => log.id)).toEqual(['food-1'])
    expect((await getNutritionByDate('2026-07-07')).dietLogs).toEqual([])
  })

  it('lists workouts under their stored date too', async () => {
    const history = await getWorkoutHistory('2026-07-02', '2026-07-08')

    expect(history['2026-07-08'].map((log) => log.id)).toEqual(['workout-1'])
    expect(history['2026-07-07']).toEqual([])
  })
})
