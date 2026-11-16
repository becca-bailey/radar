/**
 * Cursor paging for the home archive. Saves are listed newest first by
 * (created_at, id); a cursor is the last row of the previous page, and the
 * next page is every row strictly after it in that order. The id breaks ties
 * between saves made in the same microsecond.
 *
 * The timestamp is kept as the exact string Postgres returned. Parsing it
 * into a JS Date would drop the microseconds and skip rows on the boundary.
 */

export interface ArchiveCursor {
  createdAt: string;
  id: string;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// What PostgREST returns for timestamptz, e.g. 2026-11-14T10:00:00.123456+00:00.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** Read the cursor from `?before=<created_at>&before_id=<id>`; null if absent or malformed. */
export function parseCursor(params: URLSearchParams): ArchiveCursor | null {
  const createdAt = params.get('before');
  const id = params.get('before_id');
  if (!createdAt || !id) return null;
  if (!TIMESTAMP_RE.test(createdAt) || !UUID_RE.test(id)) return null;
  return { createdAt, id };
}

/** Query string for the page after `last`, keeping the topic filter. */
export function nextPageHref(last: ArchiveCursor, topic: string | null): string {
  const params = new URLSearchParams();
  if (topic) params.set('topic', topic);
  params.set('before', last.createdAt);
  params.set('before_id', last.id);
  return `/?${params}`;
}

/**
 * PostgREST `or` filter for rows after the cursor in (created_at desc, id desc)
 * order. Only call with a cursor from parseCursor, which has validated both parts.
 */
export function afterCursorFilter(c: ArchiveCursor): string {
  return `created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt.${c.id})`;
}
