import { addDaysToKey, isDayKey, mondayOf } from './dates';

/**
 * Paging for a group's week pages (/groups/:id/week?of=YYYY-MM-DD). Weeks are
 * named by their Monday. Paging is finite: never later than this week, never
 * earlier than the week the group was made.
 */

/** The week to show for an `of` param: its Monday, clamped to the group's weeks. */
export function resolveWeek(of: string | null, firstWeek: string, currentWeek: string): string {
  if (!isDayKey(of)) return currentWeek;
  const week = mondayOf(of);
  if (week > currentWeek) return currentWeek;
  if (week < firstWeek) return firstWeek;
  return week;
}

export interface WeekPaging {
  /** Monday of the week before, or null when there's nothing to page back to. */
  earlier: string | null;
  /** Monday of the week after, or null on the current week. */
  later: string | null;
  /** Monday of the latest earlier week with shares, when it's further back than `earlier`. */
  skipTo: string | null;
}

/**
 * `latestBefore` is the Monday of the week holding the latest share before
 * this week: null if nothing was shared before it, so there's no "Earlier"
 * link to click through empty weeks; undefined if unknown (the lookup
 * failed), so paging falls back to the group's first week.
 */
export function weekPaging(
  week: string,
  {
    firstWeek,
    currentWeek,
    latestBefore,
  }: { firstWeek: string; currentWeek: string; latestBefore: string | null | undefined }
): WeekPaging {
  const previous = addDaysToKey(week, -7);
  const earlier = week > firstWeek && latestBefore !== null ? previous : null;
  return {
    earlier,
    later: week < currentWeek ? addDaysToKey(week, 7) : null,
    skipTo: earlier && latestBefore && latestBefore < previous ? latestBefore : null,
  };
}

export const weekPath = (home: string, monday: string) => `${home}/week?of=${monday}`;
