import type { SupabaseClient } from '@supabase/supabase-js';
import { inverseFrequencyWeight } from './ranking';

const WINDOW_DAYS = 30;
const MIN_INDEPENDENT_GROUPS = 3; // g (PLAN.md §7)
const MAX_MEMBER_OVERLAP = 0.3;
const BETA = 0.3;

export interface PublicHighlight {
  title: string | null;
  canonicalUrl: string;
  source: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  groupCount: number;
  score: number;
}

/**
 * The public layer (PLAN.md §7): a link surfaces publicly when recommended in
 * at least g independent groups (pairwise member overlap < 30%) among groups
 * that opted in. Output is counts only — never who.
 */
export async function computePublicHighlights(service: SupabaseClient): Promise<PublicHighlight[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: recs, error } = await service
    .from('recommendations')
    .select(
      'link_id, group_id, groups!inner(contribute_public), links!inner(title, canonical_url, source, status, category_id, categories(slug, name))'
    )
    .eq('groups.contribute_public', true)
    .eq('links.status', 'ready')
    .gte('created_at', since);
  if (error) throw new Error(`Public layer read failed: ${error.message}`);
  if (!recs?.length) return [];

  // Group memberships for the overlap check.
  const groupIds = [...new Set(recs.map((r) => r.group_id))];
  const { data: members } = await service
    .from('memberships')
    .select('group_id, user_id')
    .in('group_id', groupIds);
  const groupMembers = new Map<string, Set<string>>();
  for (const m of members ?? []) {
    const set = groupMembers.get(m.group_id) ?? new Set<string>();
    set.add(m.user_id);
    groupMembers.set(m.group_id, set);
  }

  const independent = (a: string, b: string): boolean => {
    const ma = groupMembers.get(a) ?? new Set();
    const mb = groupMembers.get(b) ?? new Set();
    if (ma.size === 0 || mb.size === 0) return true;
    let shared = 0;
    for (const u of ma) if (mb.has(u)) shared++;
    return shared / Math.min(ma.size, mb.size) < MAX_MEMBER_OVERLAP;
  };

  // Collect per-link group sets and metadata.
  interface Agg {
    groups: Set<string>;
    title: string | null;
    canonicalUrl: string;
    source: string | null;
    categorySlug: string | null;
    categoryName: string | null;
  }
  const byLink = new Map<string, Agg>();
  for (const r of recs) {
    const link = r.links as unknown as {
      title: string | null;
      canonical_url: string;
      source: string | null;
      categories: { slug: string; name: string } | null;
    };
    let agg = byLink.get(r.link_id);
    if (!agg) {
      agg = {
        groups: new Set(),
        title: link.title,
        canonicalUrl: link.canonical_url,
        source: link.source,
        categorySlug: link.categories?.slug ?? null,
        categoryName: link.categories?.name ?? null,
      };
      byLink.set(r.link_id, agg);
    }
    agg.groups.add(r.group_id);
  }

  const contributingGroups = groupIds.length;

  // Source stats for the public score.
  const { data: statRows } = await service.rpc('source_recommendation_stats', { days: 90 });
  const sourceCounts = new Map<string, number>();
  let total = 0;
  for (const row of (statRows ?? []) as Array<{ source: string; cnt: number }>) {
    sourceCounts.set(row.source, Number(row.cnt));
    total += Number(row.cnt);
  }

  const highlights: PublicHighlight[] = [];
  for (const agg of byLink.values()) {
    // Greedy maximal set of pairwise-independent groups.
    const kept: string[] = [];
    for (const g of agg.groups) {
      if (kept.every((k) => independent(k, g))) kept.push(g);
    }
    if (kept.length < MIN_INDEPENDENT_GROUPS) continue;

    const p = kept.length / Math.max(contributingGroups, MIN_INDEPENDENT_GROUPS);
    const a = agg.source ? (sourceCounts.get(agg.source) ?? 0) : 0;
    const score = p * (1 + BETA * inverseFrequencyWeight(a, total));
    highlights.push({
      title: agg.title,
      canonicalUrl: agg.canonicalUrl,
      source: agg.source,
      categorySlug: agg.categorySlug,
      categoryName: agg.categoryName,
      groupCount: kept.length,
      score,
    });
  }

  return highlights.sort((x, y) => y.score - x.score);
}
