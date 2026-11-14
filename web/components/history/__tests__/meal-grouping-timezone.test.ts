import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The timelines import server actions; keep the service-role client out of the test.
vi.mock('@/app/actions/logFood', () => ({ deleteDietLog: vi.fn() }))
vi.mock('@/app/actions/logWorkout', () => ({
  deleteWorkoutLog: vi.fn(),
  updateWorkoutLog: vi.fn(),
  createWorkoutLog: vi.fn(),
}))
vi.mock('@/app/actions/saveDietLog', () => ({ saveDietLog: vi.fn() }))
vi.mock('@/app/actions/updateDietLog', () => ({ updateDietLog: vi.fn() }))

import { bucketByLoggedAt as recordSlot } from '@/components/history/day-timeline'
import { bucketByLoggedAt as mealSheetSlot } from '@/components/nutrition/meal-timeline'
import { minutesOfDay, resolveLogTimestamp } from '@/lib/utils/date'

/**
 * Make the runtime's *local* clock getters answer as a browser in the given
 * zone would, on any machine. Code that still reads `getHours()` sees that
 * zone's wall clock; code that reads the app time zone is unaffected.
 */
function pretendBrowserIsIn(timeZone: string) {
  const local = (date: Date, type: 'hour' | 'minute') =>
    Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        hour: 'numeric',
        minute: 'numeric',
      })
        .formatToParts(date)
        .find((part) => part.type === type)?.value
    )
  vi.spyOn(Date.prototype, 'getHours').mockImplementation(function (this: Date) {
    return local(this, 'hour')
  })
  vi.spyOn(Date.prototype, 'getMinutes').mockImplementation(function (this: Date) {
    return local(this, 'minute')
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-12-01T18:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('meal grouping uses the app time zone (America/Chicago), not the browser clock', () => {
  it.each(['Asia/Shanghai', 'America/Chicago', 'UTC', 'Europe/London', 'Pacific/Auckland'])(
    'files a back-dated meal under lunch for a browser in %s',
    (browserZone) => {
      pretendBrowserIsIn(browserZone)
      const { date, loggedAt } = resolveLogTimestamp('2026-07-05')

      expect(date).toBe('2026-07-05')
      expect(loggedAt).toBe('2026-07-05T17:00:00.000Z') // stored in UTC: noon CDT
      expect(minutesOfDay(loggedAt)).toBe(12 * 60)
      expect(recordSlot(loggedAt)).toBe('lunch')
      expect(mealSheetSlot(loggedAt)).toBe('lunch')
    }
  )

  it('is not thrown by a browser on the other side of the world', () => {
    pretendBrowserIsIn('Asia/Shanghai')
    const { loggedAt } = resolveLogTimestamp('2026-07-05')

    // What browser-local grouping would see (01:00 the next morning)...
    expect(new Date(loggedAt).getHours()).toBe(1)
    // ...versus what both timelines use.
    expect(recordSlot(loggedAt)).toBe('lunch')
    expect(mealSheetSlot(loggedAt)).toBe('lunch')
  })

  it.each([
    ['in winter (CST)', '2026-01-05', '2026-01-05T18:00:00.000Z'],
    ['in summer (CDT)', '2026-07-05', '2026-07-05T17:00:00.000Z'],
    ['on the day clocks go forward', '2026-03-08', '2026-03-08T17:00:00.000Z'],
    ['on the day clocks go back', '2026-11-01', '2026-11-01T18:00:00.000Z'],
  ])('files a back-dated meal under lunch %s', (_label, day, expectedUtc) => {
    pretendBrowserIsIn('Asia/Shanghai')
    const { date, loggedAt } = resolveLogTimestamp(day)

    expect(date).toBe(day)
    expect(loggedAt).toBe(expectedUtc)
    expect(recordSlot(loggedAt)).toBe('lunch')
    expect(mealSheetSlot(loggedAt)).toBe('lunch')
  })

  it('groups same-day meals by the app zone clock too', () => {
    pretendBrowserIsIn('Asia/Shanghai')
    // 08:00 / 19:00 / 23:30 in America/Chicago (CDT) on 7 July.
    expect(recordSlot('2026-07-07T13:00:00Z')).toBe('breakfast')
    expect(mealSheetSlot('2026-07-07T13:00:00Z')).toBe('breakfast')
    expect(recordSlot('2026-07-08T00:00:00Z')).toBe('dinner')
    expect(mealSheetSlot('2026-07-08T00:00:00Z')).toBe('dinner')
    expect(recordSlot('2026-07-08T04:30:00Z')).toBe('lateNight')
    expect(mealSheetSlot('2026-07-08T04:30:00Z')).toBe('lateNight')
  })

  it('groups by the wall clock across a daylight-saving change', () => {
    // 08:00 on the Saturday before and the Sunday of the spring change: the
    // same meal, although the two instants are 23 hours apart.
    expect(recordSlot('2026-03-07T14:00:00Z')).toBe('breakfast') // 08:00 CST
    expect(recordSlot('2026-03-08T13:00:00Z')).toBe('breakfast') // 08:00 CDT
    expect(mealSheetSlot('2026-03-07T14:00:00Z')).toBe('breakfast')
    expect(mealSheetSlot('2026-03-08T13:00:00Z')).toBe('breakfast')
    // 19:00 on the Sunday clocks go back is dinner, 01:00 UTC the next day.
    expect(recordSlot('2026-11-02T01:00:00Z')).toBe('dinner')
    expect(mealSheetSlot('2026-11-02T01:00:00Z')).toBe('dinner')
  })

  it('reads an entry written under the old Asia/Shanghai calendar on the Chicago clock', () => {
    // Known consequence of the switch, recorded here on purpose: stored
    // instants are unchanged, so a meal back-dated to Shanghai noon (04:00 UTC)
    // now reads 23:00 the evening before. Its `date` column — the day it is
    // listed under — is untouched (see app/actions/__tests__/history.test.ts).
    const legacyBackdatedLunch = '2026-07-05T04:00:00Z'
    expect(minutesOfDay(legacyBackdatedLunch)).toBe(23 * 60)
    expect(recordSlot(legacyBackdatedLunch)).toBe('lateNight')
    expect(mealSheetSlot(legacyBackdatedLunch)).toBe('lateNight')
  })
})
