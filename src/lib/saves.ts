import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUrl, unwrapAmpCacheUrl } from './canonicalize';
import { sourceForUrl } from './sources';

export interface SaveInput {
  url: string;
  note?: string | null;
  /** Page title as seen by the saver (bookmarklet/Shortcut). Provisional:
   * shown until ingest extracts the real one. */
  title?: string | null;
  waybackRequested?: boolean;
}

export interface SaveResult {
  saveId: string;
  linkId: string;
  canonicalUrl: string;
  alreadySaved: boolean;
}

/**
 * The save path (PLAN.md: archive first, enrichment async). Synchronous
 * canonicalization only — no network. The ingest worker refines the canonical
 * URL from the fetched page later and merges duplicates if it changes.
 */
export async function createSave(
  service: SupabaseClient,
  userId: string,
  input: SaveInput
): Promise<SaveResult> {
  const originalUrl = input.url.trim();
  const canonicalUrl = normalizeUrl(unwrapAmpCacheUrl(originalUrl)); // throws TypeError on junk

  // Moderation (PLAN.md §9): blocklist at ingest + per-account rate limit.
  const host = new URL(canonicalUrl).hostname;
  const { data: blocked } = await service
    .from('blocked_hosts')
    .select('host')
    .eq('host', host)
    .maybeSingle();
  if (blocked) {
    throw new TypeError('That site cannot be saved here.');
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await service
    .from('saves')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', dayAgo);
  if ((count ?? 0) >= 200) {
    throw new TypeError('Daily save limit reached. Try again tomorrow.');
  }

  const providedTitle = input.title?.trim().slice(0, 300) || null;

  // Find-or-create the Link row (one per canonical URL, system-wide).
  let { data: link } = await service
    .from('links')
    .select('id, title')
    .eq('canonical_url', canonicalUrl)
    .maybeSingle();

  let isNewLink = false;
  if (!link) {
    const inserted = await service
      .from('links')
      .upsert(
        // Source and title are recomputed at ingest (from the fetched page);
        // setting them now means the archive UI shows them before the worker
        // runs — and keeps showing a title if the fetch fails.
        { canonical_url: canonicalUrl, source: sourceForUrl(canonicalUrl), title: providedTitle },
        { onConflict: 'canonical_url', ignoreDuplicates: true }
      )
      .select('id, title')
      .maybeSingle();
    if (inserted.data) {
      link = inserted.data;
      isNewLink = true;
    } else {
      // Lost a race: someone else inserted it between our select and upsert.
      const again = await service.from('links').select('id, title').eq('canonical_url', canonicalUrl).single();
      if (again.error) throw new Error(`Link lookup failed: ${again.error.message}`);
      link = again.data;
    }
  }

  // An existing link that never got a title (e.g. its fetch failed) can
  // still take the saver's provisional one.
  if (!isNewLink && providedTitle && !(link as { title?: string | null }).title) {
    await service.from('links').update({ title: providedTitle }).eq('id', link.id).is('title', null);
  }

  if (isNewLink) {
    const job = await service
      .from('ingest_jobs')
      .upsert({ link_id: link.id }, { onConflict: 'link_id', ignoreDuplicates: true });
    if (job.error) throw new Error(`Failed to enqueue ingest: ${job.error.message}`);
  }

  const { data: existing } = await service
    .from('saves')
    .select('id')
    .eq('user_id', userId)
    .eq('link_id', link.id)
    .maybeSingle();

  if (existing) {
    // Re-saving updates the note only when new text was provided.
    const patch: Record<string, unknown> = {};
    if (input.note) patch.note = input.note;
    if (input.waybackRequested) patch.wayback_requested = true;
    if (Object.keys(patch).length > 0) {
      const updated = await service.from('saves').update(patch).eq('id', existing.id);
      if (updated.error) throw new Error(`Failed to update save: ${updated.error.message}`);
    }
    return { saveId: existing.id, linkId: link.id, canonicalUrl, alreadySaved: true };
  }

  const { data: save, error } = await service
    .from('saves')
    .insert({
      user_id: userId,
      link_id: link.id,
      original_url: originalUrl,
      note: input.note || null,
      wayback_requested: input.waybackRequested ?? false,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to insert save: ${error.message}`);

  return { saveId: save.id, linkId: link.id, canonicalUrl, alreadySaved: false };
}
