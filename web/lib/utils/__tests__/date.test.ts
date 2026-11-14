import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APP_TIME_ZONE,
  addDays,
  formatCalendarDate,
  formatClock,
  getTodayDate,
  isDateStr,
  minutesOfDay,
  resolveLogTimestamp,
  toLocalDateStr,
  weekdayIndex,
} from '@/lib/utils/date'

// These expectations are about America/Chicago wall-clock time and must hold
// whatever zone the machine running them is in (they are also run with TZ=UTC).
// 2026 clock changes there: 8 March 02:00 → 03:00 (CST → CDT, UTC-6 → UTC-5)
// and 1 November 02:00 → 01:00 (CDT → CST).

const at = (iso: string) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('calendar-date helpers', () => {
  it('keeps the app calendar in America/Chicago', () => {
    expect(APP_TIME_ZONE).toBe('America/Chicago')
  })

  it('formats a date in the app time zone, not UTC', () => {
    // 03:30 UTC on the 8th is still 22:30 on the 7th in Chicago.
    expect(toLocalDateStr(new Date('2026-07-08T03:30:00Z'))).toBe('2026-07-07')
    expect(toLocalDateStr(new Date('2026-07-08T03:30:00Z'), 'UTC')).toBe('2026-07-08')
  })

  it('shifts dates across month, year and leap-day boundaries', () => {
    expect(addDays('2026-07-08', 1)).toBe('2026-07-09')
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-07-08', 0)).toBe('2026-07-08')
  })

  it('returns a Monday-first weekday index', () => {
    expect(weekdayIndex('2026-07-06')).toBe(0) // Monday
    expect(weekdayIndex('2026-07-08')).toBe(2) // Wednesday
    expect(weekdayIndex('2026-07-12')).toBe(6) // Sunday
  })

  it('recognises well-formed date strings only', () => {
    expect(isDateStr('2026-07-08')).toBe(true)
    expect(isDateStr('2026-7-8')).toBe(false)
    expect(isDateStr('2026-07-08T00:00:00Z')).toBe(false)
    expect(isDateStr(undefined)).toBe(false)
  })

  it('formats a calendar date the same in every zone', () => {
    // A date-only value must not slide to the previous day west of UTC.
    expect(
      formatCalendarDate('2026-07-08', 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    ).toBe('Wednesday, July 8')
    expect(formatCalendarDate('2026-03-01', 'en-US', { weekday: 'short', day: 'numeric' })).toBe(
      '1 Sun'
    )
    expect(formatCalendarDate('2026-01-01', 'en-US', { month: 'long' })).toBe('January')
  })
})

describe('Chicago midnight', () => {
  it('turns the day over at 05:00 UTC in summer', () => {
    at('2026-07-08T04:59:59Z') // 23:59:59 CDT on the 7th
    expect(getTodayDate()).toBe('2026-07-07')
    expect(formatClock()).toBe('23:59')

    at('2026-07-08T05:00:00Z') // 00:00 CDT on the 8th
    expect(getTodayDate()).toBe('2026-07-08')
    expect(formatClock()).toBe('00:00')
  })

  it('turns the day over at 06:00 UTC in winter', () => {
    at('2026-01-15T05:59:59Z') // 23:59:59 CST on the 14th
    expect(getTodayDate()).toBe('2026-01-14')

    at('2026-01-15T06:00:00Z') // 00:00 CST on the 15th
    expect(getTodayDate()).toBe('2026-01-15')
  })

  it('is neither the UTC date nor the old Shanghai date in the evening', () => {
    // 20:00 CDT on the 7th: already the 8th in UTC and in Asia/Shanghai.
    at('2026-07-08T01:00:00Z')
    expect(getTodayDate()).toBe('2026-07-07')
    expect(getTodayDate('UTC')).toBe('2026-07-08')
    expect(getTodayDate('Asia/Shanghai')).toBe('2026-07-08')
  })

  it('reads minutes past midnight on the app clock', () => {
    expect(minutesOfDay('2026-07-05T05:00:00Z')).toBe(0) // midnight, not "24:00"
    expect(minutesOfDay(new Date('2026-07-05T04:59:00Z'))).toBe(23 * 60 + 59)
    expect(minutesOfDay('2026-07-05T17:00:00Z')).toBe(12 * 60)
    // Another zone can still be asked for explicitly.
    expect(minutesOfDay('2026-07-05T17:00:00Z', 'Asia/Shanghai')).toBe(60) // 01:00 next day
  })
})

describe('daylight saving time', () => {
  it('starts the spring-forward day at 06:00 UTC and the next one at 05:00 UTC', () => {
    // 8 March 2026 is 23 hours long.
    expect(toLocalDateStr(new Date('2026-03-08T05:59:59Z'))).toBe('2026-03-07')
    expect(toLocalDateStr(new Date('2026-03-08T06:00:00Z'))).toBe('2026-03-08')
    expect(toLocalDateStr(new Date('2026-03-09T04:59:59Z'))).toBe('2026-03-08')
    expect(toLocalDateStr(new Date('2026-03-09T05:00:00Z'))).toBe('2026-03-09')
  })

  it('starts the fall-back day at 05:00 UTC and the next one at 06:00 UTC', () => {
    // 1 November 2026 is 25 hours long.
    expect(toLocalDateStr(new Date('2026-11-01T04:59:59Z'))).toBe('2026-10-31')
    expect(toLocalDateStr(new Date('2026-11-01T05:00:00Z'))).toBe('2026-11-01')
    expect(toLocalDateStr(new Date('2026-11-02T05:59:59Z'))).toBe('2026-11-01')
    expect(toLocalDateStr(new Date('2026-11-02T06:00:00Z'))).toBe('2026-11-02')
  })

  it('skips 02:00–03:00 in spring and repeats 01:00–02:00 in autumn', () => {
    expect(formatClock('2026-03-08T07:59:00Z')).toBe('01:59') // CST
    expect(formatClock('2026-03-08T08:00:00Z')).toBe('03:00') // CDT, one minute later
    expect(formatClock('2026-11-01T06:30:00Z')).toBe('01:30') // CDT
    expect(formatClock('2026-11-01T07:30:00Z')).toBe('01:30') // CST, an hour later
    expect(minutesOfDay('2026-11-01T07:30:00Z')).toBe(90)
  })

  it('back-dates to local noon on either side of a clock change', () => {
    at('2026-12-01T18:00:00Z')
    const noonUtc = (date: string) => resolveLogTimestamp(date).loggedAt
    // Spring: noon moves from 18:00 UTC (CST) to 17:00 UTC (CDT) on the day itself.
    expect(noonUtc('2026-03-07')).toBe('2026-03-07T18:00:00.000Z')
    expect(noonUtc('2026-03-08')).toBe('2026-03-08T17:00:00.000Z')
    expect(noonUtc('2026-03-09')).toBe('2026-03-09T17:00:00.000Z')
    // Autumn: back to 18:00 UTC on the day the clocks go back.
    expect(noonUtc('2026-10-31')).toBe('2026-10-31T17:00:00.000Z')
    expect(noonUtc('2026-11-01')).toBe('2026-11-01T18:00:00.000Z')
    expect(noonUtc('2026-11-02')).toBe('2026-11-02T18:00:00.000Z')
    for (const date of ['2026-03-07', '2026-03-08', '2026-03-09', '2026-10-31', '2026-11-01', '2026-11-02']) {
      expect(minutesOfDay(noonUtc(date))).toBe(12 * 60)
      expect(toLocalDateStr(new Date(noonUtc(date)))).toBe(date)
    }
  })

  it('builds a Monday–Sunday week of seven distinct days across a clock change', () => {
    // Late on the spring-forward Sunday, the way the weekly trend builds its range.
    at('2026-03-09T03:30:00Z') // 22:30 CDT on Sunday 8 March
    const today = getTodayDate()
    expect(today).toBe('2026-03-08')
    expect(weekdayIndex(today)).toBe(6)

    const monday = addDays(today, -weekdayIndex(today))
    const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    expect(week).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ])
    expect(week.map(weekdayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
    // And the same across the autumn change.
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })
})

describe('resolveLogTimestamp', () => {
  it('uses the current instant, stored in UTC, for today', () => {
    at('2026-07-08T03:15:00Z') // 22:15 CDT on the 7th
    expect(resolveLogTimestamp(undefined)).toEqual({
      date: '2026-07-07',
      loggedAt: '2026-07-08T03:15:00.000Z',
    })
    expect(resolveLogTimestamp(getTodayDate()).loggedAt).toBe('2026-07-08T03:15:00.000Z')
  })

  it('back-dates to noon in the app time zone, whatever zone the server runs in', () => {
    at('2026-07-08T03:15:00Z')
    // Noon in Chicago is 17:00 UTC in summer (CDT)...
    expect(resolveLogTimestamp('2026-07-05')).toEqual({
      date: '2026-07-05',
      loggedAt: '2026-07-05T17:00:00.000Z',
    })
    // ...and 18:00 UTC in winter (CST).
    expect(resolveLogTimestamp('2026-01-05')).toEqual({
      date: '2026-01-05',
      loggedAt: '2026-01-05T18:00:00.000Z',
    })
    // Another zone can still be asked for explicitly.
    expect(resolveLogTimestamp('2026-07-05', 'Asia/Shanghai').loggedAt).toBe(
      '2026-07-05T04:00:00.000Z'
    )
  })

  it('keeps a back-dated entry on the day it was entered for', () => {
    at('2026-07-08T03:15:00Z')
    const { date, loggedAt } = resolveLogTimestamp('2026-07-05')
    // The stored instant falls on that same day when read back in the app zone.
    expect(toLocalDateStr(new Date(loggedAt))).toBe(date)
  })

  it('falls back to today for malformed or future dates', () => {
    at('2026-07-08T03:15:00Z') // the 7th in Chicago
    // The 8th is today in UTC, but still tomorrow on the app calendar.
    expect(resolveLogTimestamp('2026-07-08').date).toBe('2026-07-07')
    expect(resolveLogTimestamp('not-a-date').date).toBe('2026-07-07')
    expect(resolveLogTimestamp('2026-07-06').date).toBe('2026-07-06')
  })
})
