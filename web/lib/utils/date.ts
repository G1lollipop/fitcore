/**
 * Today's date as `YYYY-MM-DD` in the given IANA time zone (default
 * Asia/Shanghai).
 *
 * Deliberately NOT `new Date().toISOString()` — that returns the UTC date, so
 * on a UTC server (e.g. Vercel) any log written between local 00:00–08:00 would
 * land on the previous day's row. `en-CA` formats as `YYYY-MM-DD`.
 */
export function getTodayDate(timeZone = 'Asia/Shanghai'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve the `date` column + `logged_at` timestamp for a log write, allowing
 * back-dated entries (historical-day editing).
 *
 * - No / invalid / future `dateStr` falls back to today.
 * - For today, `loggedAt` is the precise current time.
 * - For a past day, `loggedAt` is noon (local) of that day, so the entry sorts
 *   into a neutral "lunch" bucket in the meal timeline rather than inheriting
 *   the current wall-clock time on the wrong date.
 */
export function resolveLogTimestamp(
  dateStr: string | undefined,
  timeZone = 'Asia/Shanghai'
): { date: string; loggedAt: string } {
  const today = getTodayDate(timeZone);
  const valid = !!dateStr && DATE_RE.test(dateStr) && dateStr <= today;
  const date = valid ? (dateStr as string) : today;
  const loggedAt =
    date === today ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
  return { date, loggedAt };
}
