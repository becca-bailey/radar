import type { SupabaseClient } from '@supabase/supabase-js';
import {
  completedPeriodFor,
  composeEdition,
  type CandidateLink,
  type RankingContext,
} from './ranking';
import { sendEditionEmails } from './editionEmail';

interface GroupRow {
  id: string;
  name: string;
  cadence: 'daily' | 'weekly' | 'biweekly';
  edition_size: number;
  per_source_cap: 1 | 2;
  names_visible: boolean;
  created_at: string;
}

/**
 * Build every edition that is due: for each group, the most recently
 * completed period that has recommendations and no edition yet. Idempotent —
 * (group_id, period_start) is unique and checked before building.
 */
export async function buildDueEditions(
  service: SupabaseClient,
  now = new Date()
): Promise<{ built: number; skipped: number }> {
  const { data: groups, error } = await service
    .from('groups')
    .select('id, name, cadence, edition_size, per_source_cap, names_visible, created_at');
  if (error) throw new Error(`Groups read failed: ${error.message}`);

  let built = 0;
  let skipped = 0;

  // System-wide source stats are shared across groups in this run.
  const stats = await loadSourceStats(service);

  for (const group of (groups ?? []) as GroupRow[]) {
    const { start, end } = completedPeriodFor(group.cadence, now);
    if (new Date(group.created_at) >= end) {
      skipped++;
      continue;
    }

    const { data: existing } = await service
      .from('editions')
      .select('id')
      .eq('group_id', group.id)
      .eq('period_start', start.toISOString())
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    const entries = await buildEditionEntries(service, group, start, end, stats);
    if (entries === null || entries.length === 0) {
      skipped++;
      continue;
    }

    const { data: edition, error: edErr } = await service
      .from('editions')
      .insert({
        group_id: group.id,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        edition_size: group.edition_size,
        active_members: entries.activeMembers,
      })
      .select('id')
      .single();
    if (edErr) {
      // Unique violation = another runner built it; anything else is real.
      if (edErr.code !== '23505') throw new Error(`Edition insert failed: ${edErr.message}`);
      skipped++;
      continue;
    }

    const rows = entries.map((e) => ({
      edition_id: edition.id,
      position: e.position,
      link_id: e.linkId,
      label: e.label,
      score: e.score,
      recommender_count: e.recommenderCount,
      proportion: e.proportion,
      title: e.title,
      canonical_url: e.canonicalUrl,
      source: e.source,
      sentences: e.sentences,
      recommender_names: group.names_visible ? e.recommenderNames : [],
      attribution_names: e.attributionNames,
    }));
    const { error: linksErr } = await service.from('edition_links').insert(rows);
    if (linksErr) throw new Error(`Edition links insert failed: ${linksErr.message}`);

    built++;
    await sendEditionEmails(service, group.id, group.name, edition.id, entries).catch((err) =>
      console.warn(`edition email failed for group ${group.id}:`, err)
    );
  }

  return { built, skipped };
}

interface SourceStats {
  counts: Map<string, number>;
  total: number;
  smallThreshold: number;
}

async function loadSourceStats(service: SupabaseClient): Promise<SourceStats> {
  const { data, error } = await service.rpc('source_recommendation_stats', { days: 90 });
  if (error) throw new Error(`Source stats failed: ${error.message}`);
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of (data ?? []) as Array<{ source: string; cnt: number }>) {
    counts.set(row.source, Number(row.cnt));
    total += Number(row.cnt);
  }
  const sorted = [...counts.values()].sort((a, b) => a - b);
  const smallThreshold = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length * 0.25)];
  return { counts, total, smallThreshold };
}

type EntriesWithMeta = ReturnType<typeof composeEdition> & { activeMembers: number };

async function buildEditionEntries(
  service: SupabaseClient,
  group: GroupRow,
  start: Date,
  end: Date,
  stats: SourceStats
): Promise<EntriesWithMeta | null> {
  const { data: recs, error } = await service
    .from('recommendations')
    .select(
      'user_id, sentence, attribution_ok, created_at, link_id, links(title, canonical_url, source, status), profiles:user_id(display_name)'
    )
    .eq('group_id', group.id)
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());
  if (error) throw new Error(`Recommendations read failed: ${error.message}`);
  if (!recs || recs.length === 0) return null;

  const byLink = new Map<string, CandidateLink>();
  for (const raw of recs) {
    const linkRow = raw.links as unknown as {
      title: string | null;
      canonical_url: string;
      source: string | null;
      status: string;
    } | null;
    if (!linkRow || linkRow.status === 'held') continue; // moderation hold
    const profile = raw.profiles as unknown as { display_name: string } | null;
    let candidate = byLink.get(raw.link_id);
    if (!candidate) {
      candidate = {
        linkId: raw.link_id,
        source: linkRow.source ?? new URL(linkRow.canonical_url).hostname,
        title: linkRow.title,
        canonicalUrl: linkRow.canonical_url,
        recommenders: [],
      };
      byLink.set(raw.link_id, candidate);
    }
    candidate.recommenders.push({
      userId: raw.user_id,
      displayName: profile?.display_name || 'A reader',
      sentence: raw.sentence,
      attributionOk: raw.attribution_ok,
      createdAt: new Date(raw.created_at),
    });
  }
  if (byLink.size === 0) return null;

  const [{ data: activeData }, seenSources, userWeights] = await Promise.all([
    service.rpc('group_active_members', {
      gid: group.id,
      win_start: start.toISOString(),
      win_end: end.toISOString(),
    }),
    loadSeenSources(service, group.id),
    loadUserWeights(service),
  ]);
  const activeMembers = Number(activeData ?? 0);

  const ctx: RankingContext = {
    editionSize: group.edition_size,
    perSourceCap: group.per_source_cap,
    activeMembers,
    windowStart: start,
    windowEnd: end,
    sourceCounts: stats.counts,
    totalRecommendations: stats.total,
    smallSourceThreshold: stats.smallThreshold,
    seenSources,
    userWeights,
  };

  const entries = composeEdition([...byLink.values()], ctx) as EntriesWithMeta;
  entries.activeMembers = activeMembers;
  return entries;
}

/**
 * Promotion damping (PLAN.md §9): an account whose last-90-day
 * recommendations are ≥80% one source (with at least 5 of them) weighs 0.5.
 */
async function loadUserWeights(service: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await service
    .from('recommendations')
    .select('user_id, links(source)')
    .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
  const perUser = new Map<string, Map<string, number>>();
  for (const row of (data ?? []) as unknown as Array<{ user_id: string; links: { source: string | null } | null }>) {
    const source = row.links?.source;
    if (!source) continue;
    const counts = perUser.get(row.user_id) ?? new Map<string, number>();
    counts.set(source, (counts.get(source) ?? 0) + 1);
    perUser.set(row.user_id, counts);
  }
  const weights = new Map<string, number>();
  for (const [userId, counts] of perUser) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const max = Math.max(...counts.values());
    if (total >= 5 && max / total >= 0.8) weights.set(userId, 0.5);
  }
  return weights;
}

async function loadSeenSources(service: SupabaseClient, groupId: string): Promise<Set<string>> {
  const { data } = await service
    .from('edition_links')
    .select('source, editions!inner(group_id)')
    .eq('editions.group_id', groupId);
  return new Set(
    ((data ?? []) as Array<{ source: string | null }>).map((r) => r.source).filter((s): s is string => !!s)
  );
}
