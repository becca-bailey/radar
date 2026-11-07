import { Readability } from '@mozilla/readability';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseHTML } from 'linkedom';
import { canonicalUrlFor } from './canonicalize';
import { embedAndCategorize } from './categorize';
import { fetchPage } from './fetchPage';
import { sourceForUrl } from './sources';

const MAX_ATTEMPTS = 3;
const MAX_TEXT_CHARS = 400_000;
const MAX_SNAPSHOT_CHARS = 800_000;

export interface IngestSummary {
  processed: number;
  succeeded: number;
  failed: number;
  requeued: number;
  merged: number;
}

/**
 * The ingest worker (PLAN.md §10): fetch → extract → embed → categorize →
 * store. Claims jobs optimistically so overlapping runs never double-process.
 */
export async function processIngestQueue(
  service: SupabaseClient,
  limit = 5
): Promise<IngestSummary> {
  const summary: IngestSummary = { processed: 0, succeeded: 0, failed: 0, requeued: 0, merged: 0 };

  const { data: jobs, error } = await service
    .from('ingest_jobs')
    .select('id, link_id, attempts')
    .eq('status', 'queued')
    .lte('run_after', new Date().toISOString())
    .order('id')
    .limit(limit);
  if (error) throw new Error(`Queue read failed: ${error.message}`);

  for (const job of jobs ?? []) {
    // Optimistic claim: only one runner wins the queued → running transition.
    const claim = await service
      .from('ingest_jobs')
      .update({ status: 'running', attempts: job.attempts + 1 })
      .eq('id', job.id)
      .eq('status', 'queued')
      .select('id');
    if (claim.error || !claim.data?.length) continue;

    summary.processed++;
    try {
      const outcome = await processOneLink(service, job.link_id);
      if (outcome === 'merged') summary.merged++;
      else summary.succeeded++;
      await service.from('ingest_jobs').update({ status: 'done', last_error: null }).eq('id', job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = job.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        summary.failed++;
        await service
          .from('ingest_jobs')
          .update({ status: 'failed', last_error: message })
          .eq('id', job.id);
        await service.from('links').update({ status: 'failed' }).eq('id', job.link_id);
      } else {
        summary.requeued++;
        const backoffMinutes = 2 ** attempts; // 2, 4 minutes
        await service
          .from('ingest_jobs')
          .update({
            status: 'queued',
            last_error: message,
            run_after: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
          })
          .eq('id', job.id);
      }
    }
  }

  return summary;
}

async function processOneLink(
  service: SupabaseClient,
  linkId: string
): Promise<'done' | 'merged'> {
  const { data: link, error } = await service
    .from('links')
    .select('id, canonical_url')
    .eq('id', linkId)
    .single();
  if (error) throw new Error(`Link ${linkId} not found: ${error.message}`);

  const page = await fetchPage(link.canonical_url);
  if (page.status >= 400) {
    throw new Error(`Fetch returned ${page.status}`);
  }

  // The fetched page may declare a different canonical URL. If a Link already
  // exists there, merge this stub into it instead of archiving twice.
  const trueCanonical = canonicalUrlFor(page.finalUrl, page.html);
  if (trueCanonical !== link.canonical_url) {
    const { data: existing } = await service
      .from('links')
      .select('id')
      .eq('canonical_url', trueCanonical)
      .neq('id', link.id)
      .maybeSingle();
    if (existing) {
      const { error: mergeErr } = await service.rpc('merge_links', {
        old_id: link.id,
        new_id: existing.id,
      });
      if (mergeErr) throw new Error(`Merge failed: ${mergeErr.message}`);
      return 'merged';
    }
    const { error: renameErr } = await service
      .from('links')
      .update({ canonical_url: trueCanonical })
      .eq('id', link.id);
    // A unique violation here means someone created the target mid-flight;
    // retry on the next run will take the merge path.
    if (renameErr) throw new Error(`Canonical update failed: ${renameErr.message}`);
  }

  // Non-HTML (PDFs, images): keep the link, note the type, no text archive.
  if (!page.html) {
    const { error: upErr } = await service
      .from('links')
      .update({
        source: sourceForUrl(trueCanonical),
        title: titleFromUrl(trueCanonical),
        metadata: { contentType: page.contentType },
        status: 'ready',
        archived_at: new Date().toISOString(),
      })
      .eq('id', link.id);
    if (upErr) throw new Error(upErr.message);
    return 'done';
  }

  const { document } = parseHTML(page.html);
  const docTitle = document.querySelector('title')?.textContent?.trim() ?? null;
  const article = new Readability(document as unknown as Document, {
    charThreshold: 100,
  }).parse();

  const title = (article?.title || docTitle || titleFromUrl(trueCanonical)).slice(0, 500);
  const fullText = (article?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT_CHARS);
  const lead = (article?.excerpt || fullText.slice(0, 400)).trim().slice(0, 1000);
  const snapshot = (article?.content ?? '').slice(0, MAX_SNAPSHOT_CHARS) || null;

  const source = await deriveSource(trueCanonical);

  let embedding: number[] | null = null;
  let categoryId: number | null = null;
  try {
    const result = await embedAndCategorize(service, title, lead);
    embedding = result.embedding;
    categoryId = result.categoryId;
  } catch (err) {
    // Categorization is enrichment, not archival — never fail the job on it.
    console.warn(`categorization failed for ${trueCanonical}:`, err);
  }

  const { error: updateErr } = await service
    .from('links')
    .update({
      title,
      source,
      lead_text: lead || null,
      full_text: fullText || null,
      html_snapshot: snapshot,
      metadata: {
        byline: article?.byline ?? null,
        siteName: article?.siteName ?? null,
        excerpt: article?.excerpt ?? null,
        contentType: page.contentType,
        fetchedFrom: page.finalUrl,
      },
      embedding,
      category_id: categoryId,
      status: 'ready',
      archived_at: new Date().toISOString(),
    })
    .eq('id', link.id);
  if (updateErr) throw new Error(updateErr.message);
  return 'done';
}

/** YouTube's source is the channel; oEmbed is keyless and reliable. */
async function deriveSource(canonicalUrl: string): Promise<string> {
  const host = new URL(canonicalUrl).hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const json = (await res.json()) as { author_name?: string };
        return sourceForUrl(canonicalUrl, { authorName: json.author_name ?? null });
      }
    } catch {
      // fall through
    }
  }
  return sourceForUrl(canonicalUrl);
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + decodeURIComponent(u.pathname);
  } catch {
    return url;
  }
}
