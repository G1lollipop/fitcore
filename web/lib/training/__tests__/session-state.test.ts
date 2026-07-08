/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach } from 'vitest'
import type { TrainingSession } from '@/lib/training/session-state'
import {
  createTrainingSession,
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
