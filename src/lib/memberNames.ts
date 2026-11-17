/**
 * A member's name in a group: required, shown on everything they share
 * there. It doesn't have to be a legal name. The database applies the same
 * rules (memberships.display_name, set_group_display_name, create_group). The
 * default name in settings (profiles.display_name) is cut to the same length
 * here; the database doesn't limit it.
 */
export const MEMBER_NAME_MAX = 40;

/** The name as stored: trimmed and cut to the limit, or null if blank. */
export function cleanMemberName(raw: unknown): string | null {
  // Count characters, not UTF-16 units, like Postgres does: never split an emoji.
  const name = Array.from(String(raw ?? '').trim()).slice(0, MEMBER_NAME_MAX).join('').trim();
  return name || null;
}

/** The default name from settings, as stored on the profile ('' for none). */
export function cleanDefaultName(raw: unknown): string {
  return cleanMemberName(raw) ?? '';
}
