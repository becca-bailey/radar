/**
 * Suggested topics for a group, the pure parts: cluster the pool's
 * embeddings, find the words the whole pool shares, and decide which
 * labeled candidates are worth showing. I/O lives in topicSuggestions.ts.
 */

/** Fewer shared links than this and there's nothing to suggest yet. */
export const MIN_POOL = 10;
/** A topic needs at least this many matching links. */
export const MIN_TOPIC = 3;
/** A topic matching more than this share of the pool is the group's theme, not a topic. */
export const MAX_POOL_SHARE = 0.5;
/** Overlap at which two link sets count as the same topic. */
export const SAME_TOPIC = 0.5;
export const MAX_SUGGESTIONS = 6;
/** Clusters sent to the LLM for names, largest first. */
export const MAX_CLUSTERS = 10;
/** Merging stops below this quantile of the pool's pairwise similarities. */
export const STOP_QUANTILE = 0.75;
/** Recompute once this many links were shared since, or the cache is this old. */
export const REFRESH_AFTER_LINKS = 3;
export const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface Candidate {
  key: string;
  name: string;
  query: string;
  /** What the lens search returned for the query when it was computed. */
  link_ids: string[];
}

export interface Dismissed {
  key: string;
  query: string;
  link_ids: string[];
}

/** pgvector comes back from PostgREST as a "[0.1,0.2,…]" string. */
export function parseVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v !== 'string' || !v.startsWith('[')) return null;
  try {
    return JSON.parse(v) as number[];
  } catch {
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** The q-quantile of a list (nearest rank on the sorted values). */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

/**
 * Average-linkage agglomerative clustering on cosine similarity. Merging
 * stops when the closest pair of clusters is less similar than the pool's
 * own STOP_QUANTILE pairwise similarity, so a focused group (where
 * everything is fairly similar) still splits into subtopics. Returns
 * clusters as index lists, largest first.
 */
export function clusterVectors(vectors: number[][], stopQuantile = STOP_QUANTILE): number[][] {
  const n = vectors.length;
  if (n === 0) return [];
  const sim: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const pairs: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = cosine(vectors[i], vectors[j]);
      sim[i][j] = s;
      sim[j][i] = s;
      pairs.push(s);
    }
  }
  const stop = quantile(pairs, stopQuantile);

  const members: (number[] | null)[] = vectors.map((_, i) => [i]);
  let alive = n;
  while (alive > 1) {
    let best = -Infinity;
    let bi = -1;
    let bj = -1;
    for (let i = 0; i < n; i++) {
      if (!members[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!members[j]) continue;
        if (sim[i][j] > best) {
          best = sim[i][j];
          bi = i;
          bj = j;
        }
      }
    }
    if (best < stop) break;
    // Lance–Williams update for average linkage: the merged cluster's
    // similarity to k is the size-weighted mean of its parts'.
    const si = members[bi]!.length;
    const sj = members[bj]!.length;
    for (let k = 0; k < n; k++) {
      if (!members[k] || k === bi || k === bj) continue;
      const s = (si * sim[bi][k] + sj * sim[bj][k]) / (si + sj);
      sim[bi][k] = s;
      sim[k][bi] = s;
    }
    members[bi] = members[bi]!.concat(members[bj]!);
    members[bj] = null;
    alive--;
  }
  return members.filter((m): m is number[] => m !== null).sort((a, b) => b.length - a.length);
}

const STOPWORDS = new Set(
  (
    'the and for with you your what how why when who are was were this that from into about after before ' +
    'over under than then them they their there here have has had not but can will just more most some ' +
    'one two all any our out its it’s it\'s his her she him new get got why does did don’t don\'t i’m ' +
    'is of to in on at by an a as be or if so up we my me do no'
  ).split(' ')
);

function normalizeWord(w: string): string {
  // Crude plural folding: "auditions" and "audition" count as one word.
  return w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
}

export function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-zÀ-ɏ']+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map(normalizeWord);
}

/**
 * Words that show up in at least `minShare` of the titles (and at least 3):
 * the group's overall theme. The LLM is told to avoid them, since a search
 * for the theme matches everything.
 */
export function themeWords(titles: string[], minShare = 0.2): string[] {
  const counts = new Map<string, number>();
  for (const t of titles) {
    for (const w of new Set(titleWords(t))) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const need = Math.max(3, Math.ceil(titles.length * minShare));
  return [...counts.entries()]
    .filter(([, c]) => c >= need)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
}

/** Share of `a` that is also in `b` (0 when `a` is empty). */
export function overlapShare(a: string[], b: string[]): number {
  if (a.length === 0) return 0;
  const set = new Set(b);
  return a.filter((x) => set.has(x)).length / a.length;
}

/** Stable identifier for a suggestion: its normalized query. */
export function suggestionKey(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Which labeled candidates to show: enough links to be a topic but not so
 * many that it's the group's whole theme, not already covered by a lens,
 * not dismissed or pinned before, and not a near-duplicate of a larger
 * candidate. Largest first, up to MAX_SUGGESTIONS.
 */
export function selectSuggestions(
  candidates: Candidate[],
  {
    poolSize,
    lensLinkIds = [],
    dismissed = [],
    max = MAX_SUGGESTIONS,
  }: { poolSize: number; lensLinkIds?: string[][]; dismissed?: Dismissed[]; max?: number }
): Candidate[] {
  const dismissedKeys = new Set(dismissed.map((d) => d.key));
  const ok = candidates
    .filter((c) => c.link_ids.length >= MIN_TOPIC)
    .filter((c) => c.link_ids.length <= poolSize * MAX_POOL_SHARE)
    .filter((c) => !dismissedKeys.has(c.key))
    .filter((c) => !lensLinkIds.some((ids) => overlapShare(c.link_ids, ids) >= SAME_TOPIC))
    .filter((c) => !dismissed.some((d) => overlapShare(c.link_ids, d.link_ids) >= SAME_TOPIC))
    .sort((a, b) => b.link_ids.length - a.link_ids.length);
  const kept: Candidate[] = [];
  for (const c of ok) {
    if (kept.some((k) => k.key === c.key || overlapShare(c.link_ids, k.link_ids) >= SAME_TOPIC)) continue;
    kept.push(c);
    if (kept.length >= max) break;
  }
  return kept;
}

/**
 * Whether the cached suggestions are out of date: none yet, a few links
 * shared since, several removed, or a week old.
 */
export function needsRefresh(
  cache: { computed_at: string; pool_size: number } | null,
  pool: { last_shared_at: string }[],
  now = Date.now()
): boolean {
  if (!cache) return true;
  const computed = new Date(cache.computed_at).getTime();
  if (now - computed > REFRESH_AFTER_MS) return true;
  const sharedSince = pool.filter((p) => new Date(p.last_shared_at).getTime() > computed).length;
  if (sharedSince >= REFRESH_AFTER_LINKS) return true;
  return cache.pool_size - pool.length >= REFRESH_AFTER_LINKS;
}

/** "6 links · 2 new this week" style counts for a suggestion. */
export function countNew(linkIds: string[], lastShared: Map<string, string>, since: number): number {
  return linkIds.filter((id) => {
    const at = lastShared.get(id);
    return at !== undefined && new Date(at).getTime() >= since;
  }).length;
}
