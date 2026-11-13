import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDays,
  getTodayDate,
  isDateStr,
  resolveLogTimestamp,
  toLocalDateStr,
  weekdayIndex,
} from '@/lib/utils/date'

afterEach(() => {
  vi.useRealTimers()
})

describe('calendar-date helpers', () => {
  it('formats a date in the app time zone, not UTC', () => {
    // 17:30 UTC on the 7th is already 01:30 on the 8th in Shanghai.
    expect(toLocalDateStr(new Date('2026-07-07T17:30:00Z'))).toBe('2026-07-08')
    expect(toLocalDateStr(new Date('2026-07-07T17:30:00Z'), 'UTC')).toBe('2026-07-07')
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
})

describe('resolveLogTimestamp', () => {
  it('uses the current instant for today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T03:15:00Z'))
    expect(resolveLogTimestamp(undefined)).toEqual({
      date: '2026-07-08',
      loggedAt: '2026-07-08T03:15:00.000Z',
    })
    expect(resolveLogTimestamp(getTodayDate()).loggedAt).toBe('2026-07-08T03:15:00.000Z')
  })

  it('back-dates to noon in the app time zone, whatever zone the server runs in', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T03:15:00Z'))
    // Noon in Shanghai (UTC+8) is 04:00 UTC.
    expect(resolveLogTimestamp('2026-07-05')).toEqual({
      date: '2026-07-05',
      loggedAt: '2026-07-05T04:00:00.000Z',
    })
    // A zone with DST: noon in New York is 16:00 UTC in summer, 17:00 in winter.
    expect(resolveLogTimestamp('2026-07-05', 'America/New_York').loggedAt).toBe(
      '2026-07-05T16:00:00.000Z'
    )
    expect(resolveLogTimestamp('2026-01-05', 'America/New_York').loggedAt).toBe(
      '2026-01-05T17:00:00.000Z'
    )
  })

  it('falls back to today for malformed or future dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T03:15:00Z'))
    expect(resolveLogTimestamp('2026-07-09').date).toBe('2026-07-08')
    expect(resolveLogTimestamp('not-a-date').date).toBe('2026-07-08')
  })
})
