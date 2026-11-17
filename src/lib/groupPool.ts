import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A group's shared links, one row per link (the group_pool function). Every
 * share carries the sharer's name in that group, never their email. A row
 * also says how many people on Radar saved the link, never who.
 */
export interface PoolLink {
  link_id: string;
  title: string | null;
  canonical_url: string;
  source: string | null;
  image: string | null;
  snippet: string;
  notes: string[];
  /** The name behind each note, in the same order. */
  note_names: string[];
  /** Members of this group who shared it. */
  readers: number;
  /** Their names in this group, oldest share first. */
  names: string[];
  /** The owner marked it picked (say, for a newsletter). */
  picked: boolean;
  last_shared_at: string;
  /** A member who shared it says they made it ("I made this"). */
  member_made: boolean;
  /** The sharers who say they made it. */
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

/** "Ana", "Ana and Bo", "Ana, Bo and 2 others". */
export function nameList(names: string[]): string {
  if (names.length <= 2) return listOf(names);
  const others = names.length - 2;
  return `${names.slice(0, 2).join(', ')} and ${others} other${others === 1 ? '' : 's'}`;
}

/** `names` without one occurrence of each of `remove` (two members can share a name). */
function without(names: string[], remove: string[]): string[] {
  const left = [...names];
  for (const r of remove) {
    const i = left.indexOf(r);
    if (i !== -1) left.splice(i, 1);
  }
  return left;
}

/**
 * "saved by 5": how many people on Radar saved the link, in any group or
 * privately. Blank for one, which is just the person who shared it.
 */
export function savedByLabel(savers: number): string {
  return savers > 1 ? `saved by ${savers}` : '';
}

/**
 * A pool card's "who" line: "shared by Ana and Bo", or for a member's own
 * work "made by Ana · also shared by Bo", then the Radar-wide count.
 */
export function poolLabel(link: Pick<PoolLink, 'member_made' | 'made_by' | 'names' | 'savers'>): string {
  const names = link.names ?? [];
  const parts: string[] = [];
  if (link.member_made) {
    const makers = link.made_by ?? [];
    parts.push(`made by ${nameList(makers)}`);
    const others = without(names, makers);
    if (others.length) parts.push(`also shared by ${nameList(others)}`);
  } else if (names.length) {
    parts.push(`shared by ${nameList(names)}`);
  }
  parts.push(savedByLabel(link.savers ?? 1));
  return parts.filter(Boolean).join(' · ');
}

/**
 * Splits a list of pool links into members' own work and everything else,
 * keeping the order within each.
 */
export function splitMemberWork<T extends { member_made?: boolean }>(links: T[]): { memberWork: T[]; shared: T[] } {
  return { memberWork: links.filter((l) => l.member_made), shared: links.filter((l) => !l.member_made) };
}
