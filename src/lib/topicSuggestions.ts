import type { SupabaseClient } from '@supabase/supabase-js';
import { embedTexts, embeddingsConfigured, nameTopics } from './embeddings';
import { fetchGroupPool } from './groupPool';
import {
  MAX_CLUSTERS,
  MIN_POOL,
  MIN_TOPIC,
  clusterVectors,
  countNew,
  needsRefresh,
  parseVector,
  selectSuggestions,
  suggestionKey,
  themeWords,
  type Candidate,
  type Dismissed,
} from './topics';

/**
 * Suggested topics for a group's owner. Everything runs in the owner's own
 * request with their Supabase client: group_topic_pool and the cache are
 * owner-only, and group_pool (the lens search) needs a member.
 */

export interface Suggestion {
  key: string;
  name: string;
  query: string;
  count: number;
  newThisWeek: number;
}

export type SuggestionsResult =
  | { status: 'ready'; topics: Suggestion[] }
  | { status: 'too_few'; shared: number; needed: number }
  | { status: 'unavailable' };

interface CacheRow {
  computed_at: string;
  pool_size: number;
  candidates: Candidate[];
  dismissed: Dismissed[];
}

interface PoolRow {
  link_id: string;
  title: string | null;
  embedding: string | null;
  last_shared_at: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Links clustered per computation: the most recently shared. */
const CLUSTER_LINKS = 200;
/**
 * Rows asked of the lens search when checking a topic. Tied to the pool
 * size, so a phrase that matches the whole theme shows up as "most of the
 * pool" and gets filtered, instead of hitting a fixed cap that looks small.
 */
const lensLimit = (poolSize: number) => Math.min(500, Math.max(60, poolSize));

async function lensLinkIds(
  supabase: SupabaseClient,
  groupId: string,
  query: string,
  embedding: unknown,
  limit: number
) {
  const { links } = await fetchGroupPool(supabase, groupId, {
    query,
    embedding: (embedding as string | number[] | null) ?? null,
    limit,
  });
  return links.map((l) => l.link_id);
}

/** Evenly spaced picks, so the sample spans the whole pool. */
function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

/**
 * Cluster the pool, name the clusters, and run each name's search phrase
 * as a lens would. Null when a provider call fails.
 */
async function computeCandidates(
  supabase: SupabaseClient,
  groupId: string,
  poolSize: number
): Promise<Candidate[] | null> {
  const { data, error } = await supabase.rpc('group_topic_pool', {
    gid: groupId,
    max_links: CLUSTER_LINKS,
    with_embeddings: true,
  });
  if (error) return null;
  const rows = ((data ?? []) as PoolRow[])
    .map((r) => ({ ...r, vector: parseVector(r.embedding) }))
    .filter((r): r is PoolRow & { vector: number[] } => r.vector !== null && !!r.title);
  // Too few embedded yet (ingest still running): don't cache an empty result.
  if (rows.length < MIN_POOL) return null;

  const clusters = clusterVectors(rows.map((r) => r.vector))
    .filter((c) => c.length >= MIN_TOPIC)
    .slice(0, MAX_CLUSTERS);
  if (clusters.length === 0) return [];

  const titles = rows.map((r) => r.title!);
  const names = await nameTopics(
    clusters.map((c, id) => ({ id, titles: c.slice(0, 8).map((i) => titles[i]) })),
    spread(titles, 15),
    themeWords(titles).slice(0, 12)
  );
  if (!names) return null;

  const unique = [...new Map(names.map((n) => [suggestionKey(n.query), n])).values()];
  if (unique.length === 0) return [];
  let embeddings: number[][];
  try {
    embeddings = await embedTexts(unique.map((n) => n.query));
  } catch {
    return null;
  }
  return Promise.all(
    unique.map(async (n, i) => ({
      key: suggestionKey(n.query),
      name: n.name,
      query: n.query,
      link_ids: await lensLinkIds(supabase, groupId, n.query, JSON.stringify(embeddings[i]), lensLimit(poolSize)),
    }))
  );
}

export async function loadSuggestions(
  supabase: SupabaseClient,
  groupId: string,
  now = Date.now()
): Promise<SuggestionsResult> {
  if (!embeddingsConfigured()) return { status: 'unavailable' };

  const [{ data: poolData, error: poolError }, { data: cacheData }, { data: lensData }] = await Promise.all([
    supabase.rpc('group_topic_pool', { gid: groupId, max_links: 5000, with_embeddings: false }),
    supabase
      .from('group_topic_suggestions')
      .select('computed_at, pool_size, candidates, dismissed')
      .eq('group_id', groupId)
      .maybeSingle(),
    supabase.from('lenses').select('query, query_embedding').eq('group_id', groupId),
  ]);
  if (poolError) return { status: 'unavailable' };
  const pool = (poolData ?? []) as PoolRow[];
  if (pool.length < MIN_POOL) return { status: 'too_few', shared: pool.length, needed: MIN_POOL };

  let cache = (cacheData ?? null) as CacheRow | null;
  if (needsRefresh(cache, pool, now)) {
    const candidates = await computeCandidates(supabase, groupId, pool.length);
    if (candidates) {
      const row = { computed_at: new Date(now).toISOString(), pool_size: pool.length, candidates };
      // Upsert leaves `dismissed` alone on an existing row.
      await supabase.from('group_topic_suggestions').upsert({ group_id: groupId, ...row }, { onConflict: 'group_id' });
      cache = { dismissed: [], ...cache, ...row };
    } else if (!cache) {
      return { status: 'unavailable' };
    }
  }

  const lenses = (lensData ?? []) as { query: string; query_embedding: unknown }[];
  const lensIds = await Promise.all(
    lenses.map((l) => lensLinkIds(supabase, groupId, l.query, l.query_embedding, lensLimit(pool.length)))
  );
  const lastShared = new Map(pool.map((p) => [p.link_id, p.last_shared_at]));
  const topics = selectSuggestions(cache!.candidates ?? [], {
    poolSize: pool.length,
    lensLinkIds: lensIds,
    dismissed: cache!.dismissed ?? [],
  }).map((c) => ({
    key: c.key,
    name: c.name,
    query: c.query,
    count: c.link_ids.length,
    newThisWeek: countNew(c.link_ids, lastShared, now - WEEK_MS),
  }));
  return { status: 'ready', topics };
}

/**
 * Stop suggesting a topic: the owner dismissed it or pinned it as a lens.
 * Its links are remembered, so a later suggestion covering mostly the same
 * links stays hidden even under a new name.
 */
export async function retireSuggestion(supabase: SupabaseClient, groupId: string, key: string): Promise<boolean> {
  const { data } = await supabase
    .from('group_topic_suggestions')
    .select('candidates, dismissed')
    .eq('group_id', groupId)
    .maybeSingle();
  if (!data) return false;
  const candidates = (data.candidates ?? []) as Candidate[];
  const dismissed = (data.dismissed ?? []) as Dismissed[];
  const found = candidates.find((c) => c.key === key);
  if (!found || dismissed.some((d) => d.key === key)) return false;
  const { error } = await supabase
    .from('group_topic_suggestions')
    .update({ dismissed: [...dismissed, { key, query: found.query, link_ids: found.link_ids }] })
    .eq('group_id', groupId);
  return !error;
}
