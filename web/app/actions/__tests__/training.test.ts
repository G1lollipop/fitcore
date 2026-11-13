import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}))
vi.mock('@/lib/auth/require-user', () => ({ authedUserId: mocks.auth }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))

import { finishTrainingSession, type FinishTrainingInput } from '../training'

const requestId = '2b1d6f0e-3c4a-4b5d-9e8f-7a6b5c4d3e2f'
const planId = '8f6fdf1b-47ac-479c-b494-aef4429ba457'
// Three sets logged: the session has been edited three times.
const input: FinishTrainingInput = {
  requestId,
  revision: 3,
  planId,
  workoutName: 'Push Day',
  startedAt: '2026-07-07T16:00:00.000Z',
  exercises: [
    {
      name: 'Bench Press',
      completedSets: [
        { setNumber: 1, weightKg: 60, reps: 10 },
        { setNumber: 2, weightKg: 60, reps: 8 },
      ],
    },
    { name: 'Push-up', completedSets: [{ setNumber: 1, weightKg: null, reps: 20 }] },
  ],
}
// The same session one edit later: a second push-up set.
const withExtraSet: FinishTrainingInput = {
  ...input,
  revision: 4,
  exercises: [
    input.exercises[0],
    {
      name: 'Push-up',
      completedSets: [
        { setNumber: 1, weightKg: null, reps: 20 },
        { setNumber: 2, weightKg: null, reps: 15 },
      ],
    },
  ],
}
// Another tab's copy of the session: also three edits, but different sets.
const otherTabSameRevision: FinishTrainingInput = {
  ...input,
  exercises: [
    {
      name: 'Bench Press',
      completedSets: [
        { setNumber: 1, weightKg: 80, reps: 5 },
        { setNumber: 2, weightKg: 80, reps: 5 },
        { setNumber: 3, weightKg: 80, reps: 4 },
      ],
    },
    { name: 'Push-up', completedSets: [] },
  ],
}

const saved = (revision: number) => ({ success: true, workoutLogId: requestId, revision })
const conflict = { success: false, error: 'SAVE_CONFLICT' }

type RpcArgs = {
  p_user_id: string
  p_request_id: string
  p_revision: number
  p_date: string
  p_plan_id: string
  p_workout_name: string
  p_duration_minutes: number
  p_calories_burned: number
  p_sets: { exercise_name: string; set_number: number; weight_kg: number | null; reps: number | null }[]
}

/**
 * In-memory stand-in for the `finish_training_session` database function,
 * following its contract: the summary row and its sets are stored together or
 * not at all; only a strictly newer revision replaces the stored session; the
 * stored snapshot sent again is confirmed unchanged; an older revision is
 * stale and the same revision with other content is a conflict, and neither
 * changes anything; once the saved workout is edited or deleted in Record,
 * every further save is a conflict. It checks how the action behaves against that contract —
 * the SQL itself is verified by `supabase/tests/production_hardening.sql`.
 */
function fakeDatabase() {
  const workouts = new Map<
    string,
    { userId: string; date: string; name: string; revision: number; durationMinutes: number }
  >()
  const sets = new Map<string, RpcArgs['p_sets']>()
  const closedByRecord = new Set<string>()
  let failSetInsert = false
  let dropResponse = false

  mocks.rpc.mockImplementation(async (name: string, args: RpcArgs) => {
    if (name !== 'finish_training_session') throw new Error(`unexpected rpc ${name}`)
    // The set insert failing aborts the transaction: nothing above it survives.
    if (failSetInsert) return { data: null, error: { message: 'set insert failed' } }

    const existing = workouts.get(args.p_request_id)
    let status: 'saved' | 'unchanged' | 'stale' | 'conflict'
    if (closedByRecord.has(args.p_request_id)) {
      // Edited or deleted in Record since it was saved: no training save applies.
      status = 'conflict'
    } else if (!existing || existing.revision < args.p_revision) {
      status = 'saved'
      workouts.set(args.p_request_id, {
        userId: args.p_user_id,
        date: existing?.date ?? args.p_date,
        name: args.p_workout_name,
        revision: args.p_revision,
        durationMinutes: args.p_duration_minutes,
      })
      sets.set(args.p_request_id, args.p_sets)
    } else if (existing.revision > args.p_revision) {
      status = 'stale'
    } else {
      const sameSnapshot =
        existing.name === args.p_workout_name &&
        JSON.stringify(sets.get(args.p_request_id)) === JSON.stringify(args.p_sets)
      status = sameSnapshot ? 'unchanged' : 'conflict'
    }

    // Committed (or left alone), but the reply never reaches the caller.
    if (dropResponse) throw new Error('fetch failed')
    return {
      data: {
        workout_log_id: args.p_request_id,
        status,
        revision: workouts.get(args.p_request_id)?.revision ?? null,
      },
      error: null,
    }
  })

  return {
    workouts,
    sets,
    /** What Record's edit does: change the saved row, which closes the session. */
    editInRecord: (id: string, durationMinutes: number) => {
      workouts.set(id, { ...workouts.get(id)!, durationMinutes })
      closedByRecord.add(id)
    },
    /** What Record's delete does: remove the workout, which closes the session. */
    deleteInRecord: (id: string) => {
      workouts.delete(id)
      sets.delete(id)
      closedByRecord.add(id)
    },
    failSetInsert: (value: boolean) => (failSetInsert = value),
    dropResponse: (value: boolean) => (dropResponse = value),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  // 16:45 UTC on the 7th is already 00:45 on the 8th in the app time zone.
  vi.setSystemTime(new Date('2026-07-07T16:45:00.000Z'))
  mocks.auth.mockResolvedValue({ ok: true, userId: 'user-1' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('finishTrainingSession', () => {
  it('sends the summary and every set in one transactional call', async () => {
    const db = fakeDatabase()

    expect(await finishTrainingSession(input)).toEqual(saved(3))

    // One call carries everything: there is no second write that could fail
    // after the first has already been committed.
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('finish_training_session', {
      p_user_id: 'user-1',
      p_request_id: requestId,
      p_revision: 3,
      p_date: '2026-07-08',
      p_plan_id: planId,
      p_workout_name: 'Push Day',
      p_duration_minutes: 45,
      p_calories_burned: 108, // (60*10 + 60*8) * 0.1
      p_sets: [
        { exercise_name: 'Bench Press', set_number: 1, weight_kg: 60, reps: 10 },
        { exercise_name: 'Bench Press', set_number: 2, weight_kg: 60, reps: 8 },
        { exercise_name: 'Push-up', set_number: 1, weight_kg: null, reps: 20 },
      ],
    })
    expect(db.sets.get(requestId)).toHaveLength(3)
    expect(mocks.revalidate).toHaveBeenCalledWith('/')
  })

  it('reports failure and stores nothing when the sets cannot be saved', async () => {
    const db = fakeDatabase()
    db.failSetInsert(true)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await finishTrainingSession(input)).toEqual({
      success: false,
      error: 'DB_INSERT_FAILED',
    })
    // No summary row without its sets, and no cache refresh for a non-save.
    expect(db.workouts.size).toBe(0)
    expect(db.sets.size).toBe(0)
    expect(mocks.revalidate).not.toHaveBeenCalled()

    // The retry (same request id) then stores the whole session exactly once.
    db.failSetInsert(false)
    expect((await finishTrainingSession(input)).success).toBe(true)
    expect(db.workouts.size).toBe(1)
    expect(db.sets.get(requestId)).toHaveLength(3)
    errorSpy.mockRestore()
  })

  it('confirms an identical retry after a lost response without a second workout', async () => {
    const db = fakeDatabase()
    db.dropResponse(true)

    // The save commits, but the caller only sees a network error.
    await expect(finishTrainingSession(input)).rejects.toThrow('fetch failed')
    expect(db.workouts.size).toBe(1)

    // Ten minutes later the same snapshot is sent again: same request id, same
    // revision, same sets. It is confirmed as already stored.
    db.dropResponse(false)
    vi.setSystemTime(new Date('2026-07-07T16:55:00.000Z'))
    expect(await finishTrainingSession(input)).toEqual(saved(3))

    expect(mocks.rpc.mock.calls.map(([, args]) => [args.p_request_id, args.p_revision])).toEqual([
      [requestId, 3],
      [requestId, 3],
    ])
    expect(mocks.rpc.mock.calls[1][1].p_sets).toEqual(mocks.rpc.mock.calls[0][1].p_sets)
    expect(db.workouts.size).toBe(1)
    expect(db.sets.get(requestId)).toHaveLength(3)
    // The later clock time of the retry does not make it a different snapshot.
    expect(db.workouts.get(requestId)?.durationMinutes).toBe(45)
    expect(mocks.revalidate).toHaveBeenCalledWith('/')
  })

  it('keeps one workout with the latest sets when a set is added before the retry', async () => {
    const db = fakeDatabase()
    db.dropResponse(true)
    await expect(finishTrainingSession(input)).rejects.toThrow('fetch failed')
    db.dropResponse(false)

    expect(await finishTrainingSession(withExtraSet)).toEqual(saved(4))

    expect(db.workouts.size).toBe(1)
    expect(db.sets.get(requestId)).toHaveLength(4)
    // The workout stays on the day it was first saved.
    expect(db.workouts.get(requestId)?.date).toBe('2026-07-08')
  })

  it('reports a conflict, and overwrites nothing, when another snapshot has the same revision', async () => {
    const db = fakeDatabase()

    // One tab saves its copy of the session at revision 3...
    expect(await finishTrainingSession(input)).toEqual(saved(3))
    // ...then a second tab sends different sets, also at revision 3.
    expect(await finishTrainingSession(otherTabSameRevision)).toEqual(conflict)

    // The first save is intact: the later equal-revision write did not win.
    expect(db.workouts.size).toBe(1)
    expect(db.sets.get(requestId)).toEqual([
      { exercise_name: 'Bench Press', set_number: 1, weight_kg: 60, reps: 10 },
      { exercise_name: 'Bench Press', set_number: 2, weight_kg: 60, reps: 8 },
      { exercise_name: 'Push-up', set_number: 1, weight_kg: null, reps: 20 },
    ])
    // Nothing changed, so there is nothing to refresh for the second call.
    expect(mocks.revalidate).toHaveBeenCalledTimes(1)

    // The first tab retrying its own snapshot is still confirmed.
    expect(await finishTrainingSession(input)).toEqual(saved(3))
  })

  it('does not let a delayed retry with an older snapshot overwrite a newer save', async () => {
    const db = fakeDatabase()

    // The newer snapshot (4 sets) reaches the database first...
    expect(await finishTrainingSession(withExtraSet)).toEqual(saved(4))
    expect(db.sets.get(requestId)).toHaveLength(4)

    // ...then the delayed retry of the older one (3 sets) finally arrives.
    const late = await finishTrainingSession(input)

    // The stored workout is untouched, and the late caller is not told that
    // its snapshot — or anything it could mistake for it — was saved.
    expect(db.sets.get(requestId)).toHaveLength(4)
    expect(db.workouts.get(requestId)?.revision).toBe(4)
    expect(db.workouts.size).toBe(1)
    expect(late).toEqual(conflict)
    expect(mocks.rpc.mock.calls.map(([, args]) => args.p_revision)).toEqual([4, 3])
  })

  it('keeps the newer save when an older request whose response was lost is replayed', async () => {
    const db = fakeDatabase()

    // The first save commits but its response is lost.
    db.dropResponse(true)
    await expect(finishTrainingSession(input)).rejects.toThrow('fetch failed')
    db.dropResponse(false)
    // The user logs another set and retries: stored.
    expect(await finishTrainingSession(withExtraSet)).toEqual(saved(4))
    // A duplicate of the first request is delivered after all.
    expect(await finishTrainingSession(input)).toEqual(conflict)

    expect(db.workouts.size).toBe(1)
    expect(db.sets.get(requestId)).toEqual(
      expect.arrayContaining([{ exercise_name: 'Push-up', set_number: 2, weight_kg: null, reps: 15 }])
    )
    expect(db.sets.get(requestId)).toHaveLength(4)
  })

  it('does not bring back a workout that was deleted in Record', async () => {
    const db = fakeDatabase()
    // Saved, but the response was lost, so the device still holds the session.
    db.dropResponse(true)
    await expect(finishTrainingSession(input)).rejects.toThrow('fetch failed')
    db.dropResponse(false)
    db.deleteInRecord(requestId)

    // Neither the identical retry nor a newer snapshot re-creates it.
    expect(await finishTrainingSession(input)).toEqual(conflict)
    expect(await finishTrainingSession(withExtraSet)).toEqual(conflict)

    expect(db.workouts.size).toBe(0)
    expect(db.sets.size).toBe(0)
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it('does not confirm or overwrite a workout that was edited in Record', async () => {
    const db = fakeDatabase()
    db.dropResponse(true)
    await expect(finishTrainingSession(input)).rejects.toThrow('fetch failed')
    db.dropResponse(false)
    db.editInRecord(requestId, 90)

    // The identical retry is not "already saved": what is stored has changed.
    expect(await finishTrainingSession(input)).toEqual(conflict)
    // A newer snapshot does not replace the edit either.
    expect(await finishTrainingSession(withExtraSet)).toEqual(conflict)

    expect(db.workouts.get(requestId)).toMatchObject({ revision: 3, durationMinutes: 90 })
    expect(db.sets.get(requestId)).toHaveLength(3)
  })

  it('treats a reply that does not confirm the submitted snapshot as a failed save', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failed = { success: false, error: 'DB_INSERT_FAILED' }
    const reply = (data: unknown) => mocks.rpc.mockResolvedValue({ data, error: null })

    reply({ workout_log_id: 'something-else', status: 'saved', revision: 3 })
    expect(await finishTrainingSession(input)).toEqual(failed)
    reply(null)
    expect(await finishTrainingSession(input)).toEqual(failed)
    // Without a status the caller could not tell whose snapshot is stored.
    reply({ workout_log_id: requestId, revision: 3 })
    expect(await finishTrainingSession(input)).toEqual(failed)
    reply({ workout_log_id: requestId, status: 'something-new', revision: 3 })
    expect(await finishTrainingSession(input)).toEqual(failed)
    // "Saved", but at a revision other than the one sent, confirms nothing —
    // whether it is older or newer than this snapshot.
    reply({ workout_log_id: requestId, status: 'saved', revision: 2 })
    expect(await finishTrainingSession(input)).toEqual(failed)
    reply({ workout_log_id: requestId, status: 'unchanged', revision: 4 })
    expect(await finishTrainingSession(input)).toEqual(failed)

    expect(mocks.revalidate).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('rejects malformed input and unauthenticated callers without writing', async () => {
    const invalid = { success: false, error: 'VALIDATION_FAILED' }
    expect(await finishTrainingSession({ ...input, requestId: 'not-a-uuid' })).toEqual(invalid)
    expect(await finishTrainingSession({ ...input, planId: 'not-a-uuid' })).toEqual(invalid)
    expect(await finishTrainingSession({ ...input, startedAt: 'yesterday' })).toEqual(invalid)
    expect(await finishTrainingSession({ ...input, revision: -1 })).toEqual(invalid)
    expect(await finishTrainingSession({ ...input, revision: 1.5 })).toEqual(invalid)

    mocks.auth.mockResolvedValue({ ok: false, result: { success: false, error: 'UNAUTHORIZED' } })
    expect(await finishTrainingSession(input)).toEqual({ success: false, error: 'UNAUTHORIZED' })

    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
