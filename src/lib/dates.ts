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

/**
 * A local YYYY-MM-DD day as the UTC instants it spans: [start, end), each an
 * ISO string for a timestamptz query. "end" is the next local midnight, so a
 * DST day is 23 or 25 hours long, and "to" includes the whole day.
 */
export function localDayRange(day: string, zone: string): { start: string; end: string } {
  const [y, m, d] = day.split('-').map(Number);
  const start = new TZDate(y, m - 1, d, zone);
  const end = addDays(start, 1);
  return { start: new Date(start.getTime()).toISOString(), end: new Date(end.getTime()).toISOString() };
}
