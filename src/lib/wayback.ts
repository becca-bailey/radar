import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Wayback Save Page Now, opt-in per save (PLAN.md §10). Only runs for links
 * whose page we fetched without a login (status = ready), and marks the save
 * so each request happens once.
 */
export async function processWaybackRequests(service: SupabaseClient, limit = 2): Promise<number> {
  const { data, error } = await service
    .from('saves')
    .select('id, links!inner(canonical_url, status)')
    .eq('wayback_requested', true)
    .is('wayback_saved_at', null)
    .eq('links.status', 'ready')
    .limit(limit);
  if (error) throw new Error(`Wayback queue read failed: ${error.message}`);

  let done = 0;
  for (const row of data ?? []) {
    const link = row.links as unknown as { canonical_url: string };
    try {
      const res = await fetch(`https://web.archive.org/save/${link.canonical_url}`, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
        headers: { 'User-Agent': 'RadarBot/0.1 (user-requested Wayback save)' },
      });
      if (res.ok || res.status === 301 || res.status === 302) {
        await service
          .from('saves')
          .update({ wayback_saved_at: new Date().toISOString() })
          .eq('id', row.id);
        done++;
      }
    } catch {
      // Leave it pending; the next run retries. Wayback is slow and flaky by
      // nature, and this is best-effort archival on top of our own copy.
    }
  }
  return done;
}
