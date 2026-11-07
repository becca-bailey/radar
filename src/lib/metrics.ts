import type { SupabaseClient } from '@supabase/supabase-js';

export interface CohortRow {
  month: string; // YYYY-MM of a source's first recommendation
  sources: number;
  surfaced: number; // reached 3+ recommendations within 90 days
}

export interface MonthlyDiversity {
  month: string;
  editions: number;
  medianDistinctSources: number;
}

export interface DashboardMetrics {
  cohorts: CohortRow[];
  topTenShare: number | null; // share of edition slots held by top 10 sources, last 90d
  diversity: MonthlyDiversity[];
}

/**
 * The measurements the ranking promises to publish (PLAN.md §7): surfacing
 * rate by cohort, concentration, and diversity. Aggregates only.
 */
export async function computeDashboardMetrics(service: SupabaseClient): Promise<DashboardMetrics> {
  // --- Cohorts: sources by month of first recommendation --------------------
  const { data: recRows } = await service
    .from('recommendations')
    .select('created_at, links(source)')
    .order('created_at');
  const firstSeen = new Map<string, Date>();
  const perSourceDates = new Map<string, Date[]>();
  for (const row of (recRows ?? []) as unknown as Array<{ created_at: string; links: { source: string | null } | null }>) {
    const source = row.links?.source;
    if (!source) continue;
    const at = new Date(row.created_at);
    if (!firstSeen.has(source)) firstSeen.set(source, at);
    const dates = perSourceDates.get(source) ?? [];
    dates.push(at);
    perSourceDates.set(source, dates);
  }

  const cohortMap = new Map<string, { sources: number; surfaced: number }>();
  for (const [source, first] of firstSeen) {
    const month = first.toISOString().slice(0, 7);
    const cutoff = first.getTime() + 90 * 24 * 60 * 60 * 1000;
    const within = (perSourceDates.get(source) ?? []).filter((d) => d.getTime() <= cutoff).length;
    const entry = cohortMap.get(month) ?? { sources: 0, surfaced: 0 };
    entry.sources++;
    if (within >= 3) entry.surfaced++;
    cohortMap.set(month, entry);
  }
  const cohorts = [...cohortMap.entries()]
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // --- Concentration + diversity over edition slots --------------------------
  const { data: slotRows } = await service
    .from('edition_links')
    .select('source, edition_id, editions!inner(period_start)');
  type SlotRow = { source: string | null; edition_id: string; editions: { period_start: string } };
  const slots = ((slotRows ?? []) as unknown as SlotRow[]).filter((s) => s.source);

  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recent = slots.filter((s) => new Date(s.editions.period_start).getTime() >= ninetyDaysAgo);
  let topTenShare: number | null = null;
  if (recent.length > 0) {
    const counts = new Map<string, number>();
    for (const s of recent) counts.set(s.source!, (counts.get(s.source!) ?? 0) + 1);
    const sorted = [...counts.values()].sort((a, b) => b - a);
    const topTen = sorted.slice(0, 10).reduce((a, b) => a + b, 0);
    topTenShare = topTen / recent.length;
  }

  const byMonthEdition = new Map<string, Map<string, Set<string>>>();
  for (const s of slots) {
    const month = s.editions.period_start.slice(0, 7);
    const editions = byMonthEdition.get(month) ?? new Map<string, Set<string>>();
    const sources = editions.get(s.edition_id) ?? new Set<string>();
    sources.add(s.source!);
    editions.set(s.edition_id, sources);
    byMonthEdition.set(month, editions);
  }
  const diversity: MonthlyDiversity[] = [...byMonthEdition.entries()]
    .map(([month, editions]) => {
      const counts = [...editions.values()].map((set) => set.size).sort((a, b) => a - b);
      const mid = Math.floor(counts.length / 2);
      const median =
        counts.length % 2 === 1 ? counts[mid] : (counts[mid - 1] + counts[mid]) / 2;
      return { month, editions: editions.size, medianDistinctSources: median };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  return { cohorts, topTenShare, diversity };
}
