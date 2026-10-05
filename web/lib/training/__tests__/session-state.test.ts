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

    it('load returns null after clear', () => {
      const session = makeSession()
      saveTrainingSession(session, { userId, planId, dayId: 'day-1', date })
      clearTrainingSession({ userId, planId, dayId: 'day-1', date })
      expect(loadTrainingSession({ userId, planId, dayId: 'day-1', date })).toBeNull()
    })
  })
})
