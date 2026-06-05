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
