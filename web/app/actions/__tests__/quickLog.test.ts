import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  completion: vi.fn(), nutrition: vi.fn(), rpc: vi.fn(), auth: vi.fn(), revalidate: vi.fn(),
}))
vi.mock('@/lib/openaiClient', () => ({ openai: { chat: { completions: { create: mocks.completion } } } }))
vi.mock('@/lib/ai/nutrition-client', () => ({ fetchNutritionApi: mocks.nutrition }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('@/lib/auth/require-user', () => ({ authedUserId: mocks.auth }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))

import { quickLog } from '../quickLog'

const requestId = '8f6fdf1b-47ac-479c-b494-aef4429ba457'
const food = { kind: 'food', food_name: 'a turkey sandwich', calories: 999 }
const workout = { kind: 'workout', workout_name: 'Walking', duration_minutes: 30, calories_burned: 120 }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ ok: true, userId: 'test-user' })
  mocks.nutrition.mockResolvedValue({ calories: 350, protein: 25, carbs: 35, fat: 12 })
  mocks.rpc.mockImplementation(async (name, args) => name === 'get_quick_log_result'
    ? { data: null, error: null }
    : { data: { items: args.p_items }, error: null })
})

function split(items: unknown[]) {
  mocks.completion.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ items }) } }] })
}

describe('unified quick logging', () => {
  it('uses Qwen nutrition for food and commits food and workout together', async () => {
    split([food, workout])
    const result = await quickLog('I ate a turkey sandwich and walked for 30 minutes', requestId)
    expect(result.success).toBe(true)
    expect(mocks.nutrition).toHaveBeenCalledWith('a turkey sandwich')
    expect(mocks.rpc).toHaveBeenCalledWith('commit_quick_log', expect.objectContaining({
      p_request_id: requestId,
      p_food_rows: [expect.objectContaining({ calories: 350, protein: 25 })],
      p_workout_rows: [expect.objectContaining({ workout_name: 'Walking', duration_minutes: 30 })],
      p_items: [expect.objectContaining({ kind: 'food' }), expect.objectContaining({ kind: 'workout' })],
    }))
  })

  it('keeps workout-only logging independent of the nutrition service', async () => {
    split([workout])
    expect((await quickLog('I walked for 30 minutes', requestId)).success).toBe(true)
    expect(mocks.nutrition).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('commit_quick_log', expect.objectContaining({ p_food_rows: [] }))
  })

  it('does not save the workout if food nutrition parsing fails', async () => {
    split([food, workout])
    mocks.nutrition.mockRejectedValue(new Error('Modal unavailable'))
    await expect(quickLog('sandwich and walking', requestId)).rejects.toThrow('Modal unavailable')
    expect(mocks.rpc.mock.calls.every(([name]) => name === 'get_quick_log_result')).toBe(true)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it('recovers a committed retry without calling either AI service', async () => {
    const saved = { items: [{ kind: 'food', id: 'saved-id', name: 'sandwich', calories: 350, protein: 25, carbs: 35, fat: 12 }] }
    mocks.rpc.mockResolvedValue({ data: saved, error: null })
    expect(await quickLog('sandwich', requestId)).toEqual({ success: true, ...saved })
    expect(mocks.completion).not.toHaveBeenCalled()
    expect(mocks.nutrition).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('preserves failure when the atomic save fails', async () => {
    split([food, workout])
    mocks.rpc.mockImplementation(async (name) => ({ data: null, error: name === 'commit_quick_log' ? { message: 'transaction failed' } : null }))
    expect(await quickLog('sandwich and walking', requestId)).toEqual({ success: false, error: 'DB_INSERT_FAILED' })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it('does not parse or write when the user is unauthenticated', async () => {
    mocks.auth.mockResolvedValue({ ok: false, result: { success: false, error: 'UNAUTHORIZED' } })
    expect(await quickLog('sandwich', requestId)).toEqual({ success: false, error: 'UNAUTHORIZED' })
    expect(mocks.completion).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
