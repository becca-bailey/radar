import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A group's shared links, one row per link (the group_pool function). Shares
 * are anonymous: a row says how many members shared the link and what they
 * wrote, never who.
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
  /** Nicknames of sharers who set one for this group; others are anonymous. */
  names: string[];
  /** The owner marked it picked (say, for a newsletter). */
  picked: boolean;
  last_shared_at: string;
  /** A member who shared it says they made it ("I made this"). */
  member_made: boolean;
  /** Nicknames of those makers who set one for this group. */
  made_by: string[];
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
 * "made by a member", "made by Ana", "made by Ana and Bo". Member work
 * carries no share count: it's shown, not ranked.
 */
export function madeByLabel(names: string[]): string {
  if (names.length === 0) return 'made by a member';
  return `made by ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`;
}

/**
 * Splits a list of pool links into members' own work and everything else,
 * keeping the order within each.
 */
export function splitMemberWork<T extends { member_made?: boolean }>(links: T[]): { memberWork: T[]; shared: T[] } {
  return { memberWork: links.filter((l) => l.member_made), shared: links.filter((l) => !l.member_made) };
}

/**
 * "", "shared by 3", "shared by Ana", "shared by Ana and 2 others". Members
 * without a nickname are counted, never named.
 */
export function sharedByLabel(readers: number, names: string[]): string {
  const shown = names.slice(0, 2);
  const others = readers - shown.length;
  if (shown.length === 0) return readers > 1 ? `shared by ${readers}` : '';
  const who = shown.join(' and ');
  if (others <= 0) return `shared by ${who}`;
  return `shared by ${shown.length === 2 ? shown.join(', ') : who} and ${others} other${others === 1 ? '' : 's'}`;
}
