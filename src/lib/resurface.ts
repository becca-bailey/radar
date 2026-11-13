/**
 * The home page's one resurfaced save: something saved a while ago, so the
 * archive gets read again instead of only growing. One per day, the same
 * all day (picked from the date, not at random per refresh).
 */

/** Saves younger than this aren't "from a while ago" yet. */
export const RESURFACE_MIN_AGE_DAYS = 30;

/** FNV-1a over the day key: stable, cheap, spreads neighbouring days. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Today's pick from the candidates (ordered consistently by the caller). */
export function pickForDay<T>(candidates: T[], dayKey: string): T | null {
  if (candidates.length === 0) return null;
  return candidates[hash(dayKey) % candidates.length];
}

/** "a month ago", "5 months ago", "a year ago", "2 years ago". */
export function agoLabel(then: Date, now: Date): string {
  const months =
    (now.getUTCFullYear() - then.getUTCFullYear()) * 12 + (now.getUTCMonth() - then.getUTCMonth()) -
    (now.getUTCDate() < then.getUTCDate() ? 1 : 0);
  if (months < 12) return months <= 1 ? 'a month ago' : `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}
