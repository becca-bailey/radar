/**
 * Every date a person sees goes through here, in their own time zone.
 * Pages render on Netlify in UTC, so formatting with the server's zone (or
 * pinning 'UTC') shows an evening save in the Americas as the next day.
 *
 * The zone comes from the browser: a `tz` cookie set on every page load,
 * copied to profiles.time_zone so it also holds before the cookie exists
 * (a first visit from a new device). See middleware.ts.
 */
import { TZDate, tz } from '@date-fns/tz';
import { addDays, differenceInCalendarDays, format } from 'date-fns';

export const TZ_COOKIE = 'tz';
/** Set once the profile holds the cookie's zone, so we write it only on change. */
export const TZ_SAVED_COOKIE = 'tz_saved';
export const DEFAULT_TIME_ZONE = 'UTC';

type DateInput = Date | string | number;

const toDate = (d: DateInput): Date => (d instanceof Date ? d : new Date(d));

/** True for an IANA zone this runtime knows ("America/Los_Angeles", "UTC"). */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The first valid zone of the candidates (cookie, then profile), else UTC. */
export function resolveTimeZone(...candidates: unknown[]): string {
  return candidates.find(isValidTimeZone) ?? DEFAULT_TIME_ZONE;
}

/** "Nov 13, 2026", or "Nov 13" with `year: false`. */
export function formatDate(date: DateInput, zone: string, { year = true }: { year?: boolean } = {}): string {
  return format(toDate(date), year ? 'MMM d, yyyy' : 'MMM d', { in: tz(zone) });
}

/**
 * "Today", "Yesterday", or the date: for when something was saved or shared.
 * Compares calendar days in the zone, so 11pm yesterday is "Yesterday" even
 * an hour later.
 */
export function formatRecentDate(
  date: DateInput,
  zone: string,
  now: Date = new Date(),
  { year = true }: { year?: boolean } = {}
): string {
  const days = differenceInCalendarDays(now, toDate(date), { in: tz(zone) });
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return formatDate(date, zone, { year });
}

/**
 * The calendar day as YYYY-MM-DD in the zone. Without a zone it uses the
 * runtime's own, which is what you want in the browser (download filenames).
 */
export function dayKey(date: DateInput, zone?: string): string {
  return format(toDate(date), 'yyyy-MM-dd', zone ? { in: tz(zone) } : undefined);
}

/** A real YYYY-MM-DD calendar day (from a date input), years 1000–9999. */
export function isDayKey(s: unknown): s is string {
  if (typeof s !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * A local YYYY-MM-DD day (checked with isDayKey) as the UTC instants it spans: [start, end), each an
 * ISO string for a timestamptz query. "end" is the next local midnight, so a
 * DST day is 23 or 25 hours long, and "to" includes the whole day.
 */
export function localDayRange(day: string, zone: string): { start: string; end: string } {
  const [y, m, d] = day.split('-').map(Number);
  const start = new TZDate(y, m - 1, d, zone);
  const end = addDays(start, 1);
  return { start: new Date(start.getTime()).toISOString(), end: new Date(end.getTime()).toISOString() };
}

/** A YYYY-MM-DD key as midnight UTC on that calendar day. */
const keyToUTC = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/**
 * Calendar arithmetic on YYYY-MM-DD keys: no zone involved, so it never
 * slips a day around DST.
 */
export function addDaysToKey(day: string, days: number): string {
  const date = keyToUTC(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday (YYYY-MM-DD) of the local week holding the day key. */
export function mondayOf(day: string): string {
  // getUTCDay: Sunday 0 … Saturday 6. Weeks run Monday to Sunday.
  return addDaysToKey(day, -((keyToUTC(day).getUTCDay() + 6) % 7));
}

/** The Monday (YYYY-MM-DD) of the week an instant falls in, in the zone. */
export function weekStartKey(date: DateInput, zone: string): string {
  return mondayOf(dayKey(date, zone));
}

/**
 * A local week (by its Monday) as UTC instants: [start, end), from Monday's
 * midnight to the next Monday's, so a DST week is an hour short or long.
 */
export function localWeekRange(monday: string, zone: string): { start: string; end: string } {
  const [y, m, d] = monday.split('-').map(Number);
  const start = new TZDate(y, m - 1, d, zone);
  const end = addDays(start, 7);
  return { start: new Date(start.getTime()).toISOString(), end: new Date(end.getTime()).toISOString() };
}

/** "Nov 9 – 15, 2026", "Nov 30 – Dec 6, 2026", "Dec 28, 2026 – Jan 3, 2027". */
export function formatWeekLabel(monday: string): string {
  const sunday = addDaysToKey(monday, 6);
  // The keys are calendar days already: format them as UTC dates.
  const show = (key: string, year: boolean) => formatDate(keyToUTC(key), 'UTC', { year });
  if (monday.slice(0, 4) !== sunday.slice(0, 4)) return `${show(monday, true)} – ${show(sunday, true)}`;
  if (monday.slice(5, 7) !== sunday.slice(5, 7)) return `${show(monday, false)} – ${show(sunday, true)}`;
  return `${show(monday, false)} – ${format(keyToUTC(sunday), 'd, yyyy', { in: tz('UTC') })}`;
}
