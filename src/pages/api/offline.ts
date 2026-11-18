import type { APIRoute } from 'astro';
import { OFFLINE_LIMIT, offlineSave, type OfflineIndex, type OfflineRow } from '../../lib/offline';

/**
 * GET /api/offline: your most recent saves that have archived text, for the
 * browser to keep as offline copies (src/scripts/offline.ts). Only the list:
 * the pages themselves are fetched from /saves/:id like any other visit.
 * 401 when signed out, which tells the browser to drop its copies.
 */
export const GET: APIRoute = async ({ locals }) => {
  const { user, supabase } = locals;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!user) return Response.json({ error: 'Sign in.' }, { status: 401, headers });

  // RLS limits this to your own saves. Same text check as
  // savesWithArchivedText: a ready link can still have no text.
  const { data, error } = await supabase
    .from('saves')
    .select('id, original_url, created_at, updated_at, links!inner(title, source, canonical_url, archived_at)')
    .or('html_snapshot.not.is.null,full_text.not.is.null', { referencedTable: 'links' })
    .order('created_at', { ascending: false })
    .limit(OFFLINE_LIMIT);
  if (error) {
    console.error('offline list failed:', error.message);
    return Response.json({ error: 'Could not list saves.' }, { status: 500, headers });
  }

  const body: OfflineIndex = {
    userId: user.id,
    saves: ((data ?? []) as unknown as OfflineRow[]).map(offlineSave),
  };
  return Response.json(body, { headers });
};
