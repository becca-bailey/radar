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
