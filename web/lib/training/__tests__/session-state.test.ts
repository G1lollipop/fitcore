/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach } from 'vitest'
import type { TrainingSession } from '@/lib/training/session-state'
import {
  createTrainingSession,
  logSet,
  removeSet,
  serializeSession,
  deserializeSession,
  buildTrainingSessionKey,
  saveTrainingSession,
  loadTrainingSession,
  clearTrainingSession,
  clearTrainingSessionIfSaved,
} from '@/lib/training/session-state'
import type { PlanDay } from '@/lib/plans/types'

function makeDay(name: string, exercises: PlanDay['exercises'] = []): PlanDay {
  return { name, rest_day: exercises.length === 0, exercises }
}

function makeSession(
  planId = 'plan-1',
  day: PlanDay = makeDay('Push', [
    { name: 'Bench Press', sets: 3, reps_min: 8, reps_max: 12, weight: 60 },
  ])
): TrainingSession {
  return createTrainingSession(planId, day)
}

describe('session-state persistence helpers', () => {
  const userId = 'user-1'
  const planId = 'plan-1'
  const date = '2026-07-08'

  beforeEach(() => {
    localStorage.clear()
  })

  describe('serializeSession / deserializeSession', () => {
    it('serializeSession converts dates to ISO strings', () => {
      const session = makeSession()
      const serialized = serializeSession(session)

      expect(serialized).toBeTypeOf('object')
      expect(serialized.planId).toBe('plan-1')
      expect(serialized.dayName).toBe('Push')
      // startedAt should be an ISO string
      expect(typeof serialized.startedAt).toBe('string')
      expect(new Date(serialized.startedAt).getTime()).toBeGreaterThan(0)
    })

    it('deserializeSession restores dates from ISO strings', () => {
      const session = makeSession()
      const serialized = serializeSession(session)
      const json = JSON.stringify(serialized)
      const restored = deserializeSession(json)

      expect(restored).not.toBeNull()
      expect(restored!.planId).toBe('plan-1')
      expect(restored!.dayName).toBe('Push')
      expect(restored!.startedAt).toBeInstanceOf(Date)
      expect(restored!.exercises).toHaveLength(1)
    })

    it('keeps the request id stable across a save/restore round trip', () => {
      const session = makeSession()
      expect(session.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )

      const restored = deserializeSession(JSON.stringify(serializeSession(session)))
      expect(restored!.requestId).toBe(session.requestId)
      // Logging more sets must not change which workout the session saves to.
      expect(logSet(restored!, 0, 1, 60, 8).requestId).toBe(session.requestId)
    })

    it('gives two sessions different request ids', () => {
      expect(makeSession().requestId).not.toBe(makeSession().requestId)
    })

    it('assigns a request id to a session stored before ids existed', () => {
      const { requestId: _omitted, ...legacy } = serializeSession(makeSession())
      const restored = deserializeSession(JSON.stringify(legacy))

      expect(restored).not.toBeNull()
      expect(restored!.requestId).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('counts every edit to the logged sets in the revision', () => {
      const session = makeSession()
      expect(session.revision).toBe(0)

      const logged = logSet(session, 0, 1, 60, 8)
      expect(logged.revision).toBe(1)
      // Removing a set is an edit too: the snapshot differs from the one before.
      const removed = removeSet(logged, 0, 1)
      expect(removed.revision).toBe(2)
      // The source session is not mutated.
      expect(session.revision).toBe(0)

      const restored = deserializeSession(JSON.stringify(serializeSession(removed)))
      expect(restored!.revision).toBe(2)
    })

    it('starts a session stored before revisions existed at revision 0', () => {
      const { revision: _omitted, ...legacy } = serializeSession(logSet(makeSession(), 0, 1, 60, 8))
      expect(deserializeSession(JSON.stringify(legacy))!.revision).toBe(0)
      expect(deserializeSession(JSON.stringify({ ...legacy, revision: 'x' }))!.revision).toBe(0)
      expect(deserializeSession(JSON.stringify({ ...legacy, revision: -3 }))!.revision).toBe(0)
    })

    it('deserializeSession returns null for invalid JSON', () => {
      expect(deserializeSession('not json')).toBeNull()
    })

    it('deserializeSession returns null for wrong shape', () => {
      expect(deserializeSession(JSON.stringify({ foo: 'bar' }))).toBeNull()
    })

    it('deserializeSession returns null for empty string', () => {
      expect(deserializeSession('')).toBeNull()
    })
  })

  describe('buildTrainingSessionKey', () => {
    it('builds expected key format', () => {
      const key = buildTrainingSessionKey({ userId, planId, dayId: 'day-1', date })
      expect(key).toBe('fitcore-training-session:user-1:plan-1:day-1:2026-07-08')
    })
  })

  describe('logSet — sequential set numbering', () => {
    it('assigns setNumber = length + 1 regardless of passed setNumber', () => {
      const session = makeSession()
      const s1 = logSet(session, 0, 99, 60, 8) // pass 99, should get setNumber 1
      expect(s1.exercises[0].completedSets[0].setNumber).toBe(1)

      const s2 = logSet(s1, 0, 99, 65, 10) // pass 99 again, should get setNumber 2
      expect(s2.exercises[0].completedSets[1].setNumber).toBe(2)
    })
  })

  describe('removeSet — reindexes remaining sets', () => {
    it('renumbers sets sequentially after removing a middle set', () => {
      const session = makeSession()
      let s = logSet(session, 0, 1, 60, 8)   // setNumber 1
      s = logSet(s, 0, 2, 65, 10)             // setNumber 2
      s = logSet(s, 0, 3, 70, 12)             // setNumber 3
      expect(s.exercises[0].completedSets.map(x => x.setNumber)).toEqual([1, 2, 3])

      // Remove the set that currently has setNumber 2
      s = removeSet(s, 0, 2)
      expect(s.exercises[0].completedSets.map(x => x.setNumber)).toEqual([1, 2])
      expect(s.exercises[0].completedSets[1].weightKg).toBe(70) // was set 3, now set 2
    })

    it('renumbers after removing the first set', () => {
      const session = makeSession()
      let s = logSet(session, 0, 1, 60, 8)
      s = logSet(s, 0, 2, 65, 10)
      s = removeSet(s, 0, 1)
      expect(s.exercises[0].completedSets.map(x => x.setNumber)).toEqual([1])
      expect(s.exercises[0].completedSets[0].weightKg).toBe(65)
    })
  })

  describe('save / load / clear cycle', () => {
    it('save writes to localStorage, load reads it back', () => {
      const session = makeSession()
      saveTrainingSession(session, { userId, planId, dayId: 'day-1', date })

      const key = buildTrainingSessionKey({ userId, planId, dayId: 'day-1', date })
      expect(localStorage.getItem(key)).toBeTruthy()

      const restored = loadTrainingSession({ userId, planId, dayId: 'day-1', date })
      expect(restored).not.toBeNull()
      expect(restored!.planId).toBe('plan-1')
    })

    it('load returns null when no session saved', () => {
      const result = loadTrainingSession({ userId, planId, dayId: 'day-1', date })
      expect(result).toBeNull()
    })

    it('clear removes the key from localStorage', () => {
      const session = makeSession()
      saveTrainingSession(session, { userId, planId, dayId: 'day-1', date })
      clearTrainingSession({ userId, planId, dayId: 'day-1', date })

      const key = buildTrainingSessionKey({ userId, planId, dayId: 'day-1', date })
      expect(localStorage.getItem(key)).toBeNull()
    })

    describe('clearTrainingSessionIfSaved', () => {
      const params = { userId, planId, dayId: 'day-1', date }

      it('clears the stored session when it is the snapshot the server confirmed', () => {
        const session = logSet(makeSession(), 0, 1, 60, 8)
        saveTrainingSession(session, params)

        expect(clearTrainingSessionIfSaved(params, session)).toBe(true)
        expect(loadTrainingSession(params)).toBeNull()
      })

      it('keeps a stored session that has been edited since the confirmed save', () => {
        const saved = logSet(makeSession(), 0, 1, 60, 8)
        const edited = logSet(saved, 0, 2, 60, 6)
        saveTrainingSession(edited, params)

        expect(clearTrainingSessionIfSaved(params, saved)).toBe(false)
        expect(loadTrainingSession(params)!.exercises[0].completedSets).toHaveLength(2)
      })

      it('keeps a stored copy that reached the same revision with different sets', () => {
        // Two tabs start from the same session and each log one set.
        const shared = makeSession()
        const thisTab = logSet(shared, 0, 1, 60, 8)
        const otherTab = logSet(shared, 0, 1, 100, 3)
        expect(otherTab.revision).toBe(thisTab.revision)
        expect(otherTab.requestId).toBe(thisTab.requestId)
        // The other tab wrote last; this tab's save is the one that was confirmed.
        saveTrainingSession(otherTab, params)

        expect(clearTrainingSessionIfSaved(params, thisTab)).toBe(false)
        expect(loadTrainingSession(params)!.exercises[0].completedSets[0].weightKg).toBe(100)
      })

      it('keeps a stored session that is not the one that was saved', () => {
        const other = makeSession()
        saveTrainingSession(other, params)

        expect(clearTrainingSessionIfSaved(params, makeSession())).toBe(false)
        expect(loadTrainingSession(params)!.requestId).toBe(other.requestId)
      })
    })

    it('load returns null after clear', () => {
      const session = makeSession()
      saveTrainingSession(session, { userId, planId, dayId: 'day-1', date })
      clearTrainingSession({ userId, planId, dayId: 'day-1', date })
      expect(loadTrainingSession({ userId, planId, dayId: 'day-1', date })).toBeNull()
    })
  })
})
