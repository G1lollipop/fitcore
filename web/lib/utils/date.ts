/**
 * The one time zone the app keeps its calendar in. A log's `date`, the
 * timestamp given to a back-dated entry, and the hour used to sort a meal into
 * breakfast/lunch/dinner must all be read in this zone — never the server's or
 * the browser's — or an entry stored for one day/meal is shown under another.
 */
export const APP_TIME_ZONE = 'Asia/Shanghai';

/**
 * Today's date as `YYYY-MM-DD` in the given IANA time zone (default
 * Asia/Shanghai).
 *
 * Deliberately NOT `new Date().toISOString()` — that returns the UTC date, so
 * on a UTC server (e.g. Vercel) any log written between local 00:00–08:00 would
 * land on the previous day's row. `en-CA` formats as `YYYY-MM-DD`.
 */
export function getTodayDate(timeZone = APP_TIME_ZONE): string {
  return toLocalDateStr(new Date(), timeZone);
}

/**
 * Format an arbitrary `Date` as `YYYY-MM-DD` in the given IANA time zone
 * (default Asia/Shanghai).
 *
 * Use this instead of `date.toISOString().split('T')[0]` anywhere a log's
 * calendar day is derived: `toISOString()` returns the UTC date, which drifts
 * a day away from the write path (which uses `getTodayDate`) around local
 * midnight and hides just-logged entries. Sharing this helper keeps the
 * read-date and write-date in the same time zone so they always agree.
 */
export function toLocalDateStr(date: Date, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed `YYYY-MM-DD` calendar-date string. */
export function isDateStr(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value);
}

/**
 * Shift a `YYYY-MM-DD` calendar date by whole days. Pure calendar arithmetic
 * (done in UTC), so the result never depends on the server's or browser's
 * local time zone.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday-first weekday index (0 = Mon … 6 = Sun) of a `YYYY-MM-DD` date. */
export function weekdayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Minutes past midnight (0–1439) shown by a wall clock in `timeZone` at the
 * given instant. Use this — not `Date#getHours()`, which reads the browser's
 * zone — to decide which meal a `logged_at` belongs to, so grouping agrees with
 * the zone the entry's `date` and back-dated noon were written in.
 */
export function minutesOfDay(instant: Date | string, timeZone = APP_TIME_ZONE): number {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      hour: 'numeric',
      minute: 'numeric',
    });
    clockFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return part('hour') * 60 + part('minute');
}

/**
 * The instant at which a wall clock in `timeZone` reads noon on `dateStr`.
 *
 * `new Date(`${dateStr}T12:00:00`)` is NOT that: it parses in the runtime's
 * local zone, so on a UTC server "noon" lands at 20:00 Shanghai time.
 */
function zonedNoon(dateStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcNoon = Date.UTC(y, m - 1, d, 12);
  // Read the zone's wall clock at UTC noon to learn its offset on that day,
  // then shift back by it. Noon is never inside a DST gap, so one pass is exact.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(utcNoon);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second')
  );
  return new Date(utcNoon - (wallAsUtc - utcNoon));
}

/**
 * Resolve the `date` column + `logged_at` timestamp for a log write, allowing
 * back-dated entries (historical-day editing).
 *
 * - No / invalid / future `dateStr` falls back to today.
 * - For today, `loggedAt` is the precise current time.
 * - For a past day, `loggedAt` is noon (in `timeZone`) of that day, so the
 *   entry sorts into a neutral "lunch" bucket in the meal timeline rather than
 *   inheriting the current wall-clock time on the wrong date. The timelines
 *   read the hour back with {@link minutesOfDay} in the same zone.
 */
export function resolveLogTimestamp(
  dateStr: string | undefined,
  timeZone = APP_TIME_ZONE
): { date: string; loggedAt: string } {
  const today = getTodayDate(timeZone);
  const date = isDateStr(dateStr) && dateStr <= today ? dateStr : today;
  const loggedAt =
    date === today ? new Date().toISOString() : zonedNoon(date, timeZone).toISOString();
  return { date, loggedAt };
}
