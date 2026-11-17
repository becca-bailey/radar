import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A group's shared links, one row per link (the group_pool function). A row
 * says how many members shared the link, what they wrote, and the names they
 * picked for the group.
 */
export interface PoolLink {
  link_id: string;
  title: string | null;
  canonical_url: string;
  source: string | null;
  image: string | null;
  snippet: string;
  notes: string[];
  readers: number;
  /** Sharers' names in this group, earliest share first. */
  names: string[];
  /** The owner marked it picked (say, for a newsletter). */
  picked: boolean;
  last_shared_at: string;
}

export interface PoolQuery {
  /** Search text; empty lists the whole pool, newest share first. */
  query?: string;
  /** A lens's stored embedding, so viewing it costs no embedding call. */
  embedding?: string | number[] | null;
  limit?: number;
  /** ISO timestamps bounding when links were shared. */
  sharedFrom?: string | null;
  sharedBefore?: string | null;
}

export async function fetchGroupPool(
  supabase: SupabaseClient,
  groupId: string,
  { query = '', embedding = null, limit = 60, sharedFrom = null, sharedBefore = null }: PoolQuery = {}
): Promise<{ links: PoolLink[]; error: string | null }> {
  const { data, error } = await supabase.rpc('group_pool', {
    gid: groupId,
    query,
    query_embedding: embedding,
    match_limit: limit,
    shared_from: sharedFrom,
    shared_before: sharedBefore,
  });
  return { links: (data ?? []) as PoolLink[], error: error?.message ?? null };
}

/**
 * "", "shared by Ana", "shared by Ana and Sam", "shared by Ana, Sam and 2 others".
 * Names a couple of sharers and counts the rest. (A nameless count like
 * "shared by 3" only appears for shares from before names were required.)
 */
export function sharedByLabel(readers: number, names: string[]): string {
  const shown = names.slice(0, 2);
  const others = readers - shown.length;
  if (shown.length === 0) return readers > 1 ? `shared by ${readers}` : '';
  const who = shown.join(' and ');
  if (others <= 0) return `shared by ${who}`;
  return `shared by ${shown.length === 2 ? shown.join(', ') : who} and ${others} other${others === 1 ? '' : 's'}`;
}

/** A `?page=` value as a page number: 1 if missing or bad, at most maxPage. */
export function parsePage(raw: string | null, maxPage: number): number {
  const n = raw !== null && /^\d{1,6}$/.test(raw) ? Number(raw) : 1;
  return Math.min(Math.max(n, 1), maxPage);
}

/**
 * One page of a newest-first list, from rows fetched up to one past the page
 * (`page * perPage + 1`), so the extra row says whether an older page exists.
 */
export function pageOf<T>(rows: T[], page: number, perPage: number): { items: T[]; hasOlder: boolean } {
  const start = (page - 1) * perPage;
  return { items: rows.slice(start, start + perPage), hasOlder: rows.length > start + perPage };
}
