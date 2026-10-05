import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardData, WorkoutLogItem } from '@/app/actions/types'
import type { NutritionDayData } from '@/app/actions/history'
import type { QuickLogResult } from '@/app/actions/quickLog'
import { DASHBOARD_KEY, useDashboardActions } from '../dashboard'
import { nutritionKey, useHistoryActions, workoutsKey } from '../history'

vi.mock('@/app/actions/dashboard', () => ({ getDashboardData: vi.fn() }))

const items: QuickLogResult[] = [
  { kind: 'food', id: 'food-1', name: 'sandwich', calories: 350, protein: 25, carbs: 35, fat: 12 },
  { kind: 'workout', id: 'workout-1', name: 'Walking', sets: null, durationMinutes: 30, caloriesBurned: 120 },
]

describe('mixed quick-log cache reconciliation', () => {
  it('updates Today and Record for both kinds and does not count a cached retry twice', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const date = '2026-10-05'
    const dashboard: DashboardData = {
      goals: { target_calories: 2000, target_protein: 150, target_carbs: 200, target_fat: 70 },
      today: { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0, calories_burned: 0, workout_duration: 0, diet_logs: [], workout_logs: [] },
    }
    client.setQueryData(DASHBOARD_KEY, dashboard)
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, unmount } = renderHook(() => ({ dashboard: useDashboardActions(), history: useHistoryActions() }), { wrapper })

    act(() => {
      for (let delivery = 0; delivery < 2; delivery++) {
        result.current.dashboard.applyQuickLogItems(items)
        result.current.history.applyResolvedQuickLog(date, 'pending-id', items)
      }
    })

    const today = client.getQueryData<DashboardData>(DASHBOARD_KEY)!.today
    expect(today.total_calories).toBe(350)
    expect(today.calories_burned).toBe(120)
    expect(today.workout_duration).toBe(30)
    expect(today.diet_logs).toHaveLength(1)
    expect(today.workout_logs).toHaveLength(1)
    expect(client.getQueryData<NutritionDayData>(nutritionKey(date))!.dietLogs).toHaveLength(1)
    expect(client.getQueryData<WorkoutLogItem[]>(workoutsKey(date))).toHaveLength(1)
    unmount()
    client.clear()
  })
})
