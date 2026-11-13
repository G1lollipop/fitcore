import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ authedUserId: mocks.auth }))
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (values: unknown) => ({
        eq: async (_column: string, userId: string) => mocks.update(values, userId),
      }),
    }),
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))

import { updateDietPlan } from '../settings'

const targets = { targetCalories: 2200, targetProtein: 140.4, targetCarbs: 250, targetFat: 70 }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ ok: true, userId: 'user-1' })
  mocks.update.mockResolvedValue({ error: null })
})

describe('updateDietPlan', () => {
  it('saves the macro targets the dialog sends, rounded to whole numbers', async () => {
    expect(await updateDietPlan(targets)).toEqual({ success: true })
    expect(mocks.update).toHaveBeenCalledWith(
      { target_calories: 2200, target_protein: 140, target_carbs: 250, target_fat: 70 },
      'user-1'
    )
  })

  it('rejects out-of-range values without writing', async () => {
    expect((await updateDietPlan({ ...targets, targetCalories: -1 })).success).toBe(false)
    expect((await updateDietPlan({ ...targets, targetFat: Number.NaN })).success).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
