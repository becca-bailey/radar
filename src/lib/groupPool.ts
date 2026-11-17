import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A group's shared links, one row per link (the group_pool function). Shares
 * are anonymous: a row says what members wrote and how many people on Radar
 * saved the link, never who.
 */
export interface PoolLink {
  link_id: string;
  title: string | null;
  canonical_url: string;
  source: string | null;
  image: string | null;
  snippet: string;
  notes: string[];
  /** Members of this group who shared it. */
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
  /** People on Radar who saved the link: in this group, another, or privately. */
  savers: number;
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

const listOf = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * "", "shared by Ana", "shared by Ana and Bo", "shared by Ana, Bo and
 * others". Only members who set a nickname are named.
 */
export function sharedByLabel(names: string[]): string {
  if (names.length === 0) return '';
  return `shared by ${names.length > 2 ? `${names.slice(0, 2).join(', ')} and others` : listOf(names)}`;
}

/** "made by a member", "made by Ana", "made by Ana and Bo". */
export function madeByLabel(names: string[]): string {
  return `made by ${names.length ? listOf(names) : 'a member'}`;
}

/**
 * "saved by 5": how many people on Radar saved the link, in any group or
 * privately. Blank for one, which is just the person who shared it.
 */
export function savedByLabel(savers: number): string {
  return savers > 1 ? `saved by ${savers}` : '';
}

/** A pool card's "who" line: maker or sharers' names, then the Radar-wide count. */
export function poolLabel(link: Pick<PoolLink, 'member_made' | 'made_by' | 'names' | 'savers'>): string {
  const who = link.member_made ? madeByLabel(link.made_by ?? []) : sharedByLabel(link.names ?? []);
  return [who, savedByLabel(link.savers ?? 1)].filter(Boolean).join(' · ');
}

/**
 * Splits a list of pool links into members' own work and everything else,
 * keeping the order within each.
 */
export function splitMemberWork<T extends { member_made?: boolean }>(links: T[]): { memberWork: T[]; shared: T[] } {
  return { memberWork: links.filter((l) => l.member_made), shared: links.filter((l) => !l.member_made) };
}
