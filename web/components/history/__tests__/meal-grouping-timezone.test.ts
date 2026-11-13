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
  vi.setSystemTime(new Date('2026-07-08T03:15:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('meal grouping uses the app time zone, not the browser clock', () => {
  it.each(['America/Chicago', 'UTC', 'Europe/London', 'Asia/Shanghai', 'Pacific/Auckland'])(
    'files a back-dated meal under lunch for a browser in %s',
    (browserZone) => {
      pretendBrowserIsIn(browserZone)
      const { date, loggedAt } = resolveLogTimestamp('2026-07-05')

      expect(date).toBe('2026-07-05')
      expect(minutesOfDay(loggedAt)).toBe(12 * 60)
      expect(recordSlot(loggedAt)).toBe('lunch')
      expect(mealSheetSlot(loggedAt)).toBe('lunch')
    }
  )

  it('reproduces the reported case: Chicago reads that timestamp as 23:00 the night before', () => {
    pretendBrowserIsIn('America/Chicago')
    const { loggedAt } = resolveLogTimestamp('2026-07-05')

    // What browser-local grouping saw (and filed under late night)...
    expect(new Date(loggedAt).getHours()).toBe(23)
    // ...versus what both timelines now use.
    expect(recordSlot(loggedAt)).toBe('lunch')
    expect(mealSheetSlot(loggedAt)).toBe('lunch')
  })

  it('groups same-day meals by the app zone clock too', () => {
    pretendBrowserIsIn('America/Chicago')
    // 08:00 / 19:00 / 23:30 in Asia/Shanghai.
    expect(recordSlot('2026-07-08T00:00:00Z')).toBe('breakfast')
    expect(mealSheetSlot('2026-07-08T00:00:00Z')).toBe('breakfast')
    expect(recordSlot('2026-07-08T11:00:00Z')).toBe('dinner')
    expect(mealSheetSlot('2026-07-08T11:00:00Z')).toBe('dinner')
    expect(recordSlot('2026-07-08T15:30:00Z')).toBe('lateNight')
    expect(mealSheetSlot('2026-07-08T15:30:00Z')).toBe('lateNight')
  })
})

describe('minutesOfDay', () => {
  it('reads the wall clock of the requested zone', () => {
    expect(minutesOfDay('2026-07-05T04:00:00Z')).toBe(720) // 12:00 Asia/Shanghai
    expect(minutesOfDay('2026-07-05T04:00:00Z', 'America/Chicago')).toBe(23 * 60) // 23:00 CDT
    expect(minutesOfDay('2026-07-05T16:00:00Z')).toBe(0) // midnight, not "24:00"
    expect(minutesOfDay(new Date('2026-07-05T15:59:00Z'))).toBe(23 * 60 + 59)
  })
})
