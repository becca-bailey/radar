import type { APIRoute } from 'astro';
import { requeueIngest } from '../../../lib/saves';
import { createServiceClient } from '../../../lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/saves/:id — manage one save from the archive list. HTML forms
 * can only POST, so the `action` field picks the operation:
 *   edit   — replace the note (empty clears it)
 *   delete — remove the save from your archive (and unshare it from groups)
 *   retry  — re-queue archiving for a link whose ingest failed
 * RLS scopes every read and write to the caller's own saves.
 */
export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user) {
    return redirect('/login');
  }

  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const topic = String(form.get('topic') ?? '');
  // Return to the same topic filter the user was looking at.
  const back = (query: string) =>
    redirect('/?' + query + (/^[a-z0-9-]+$/.test(topic) ? `&topic=${topic}` : ''));
  const fail = (msg: string) => back('error=' + encodeURIComponent(msg));

  const id = params.id ?? '';
  if (!UUID_RE.test(id)) {
    return fail('That save was not found.');
  }

  if (action === 'edit') {
    const note = String(form.get('note') ?? '').trim() || null;
    const { data, error } = await supabase.from('saves').update({ note }).eq('id', id).select('id');
    if (error) return fail('Could not update the note. Try again.');
    if (!data?.length) return fail('That save was not found.');
    return back('updated=1');
  }

  if (action === 'delete') {
    const { data, error } = await supabase.from('saves').delete().eq('id', id).select('id');
    if (error) return fail('Could not delete that save. Try again.');
    if (!data?.length) return fail('That save was not found.');
    return back('deleted=1');
  }

  if (action === 'retry') {
    const { data: save } = await supabase
      .from('saves')
      .select('id, link_id, links(status)')
      .eq('id', id)
      .maybeSingle();
    if (!save) return fail('That save was not found.');
    const status = (save.links as unknown as { status: string } | null)?.status;
    if (status !== 'failed') {
      // Already retried (or fixed by someone else's save of the same link).
      return back('retrying=1');
    }
    try {
      await requeueIngest(createServiceClient(), save.link_id as string);
    } catch (err) {
      console.error('retry failed:', err);
      return fail('Could not retry archiving. Try again.');
    }
    if (import.meta.env.DEV) {
      // No scheduled functions in local dev; kick the queue ourselves.
      void fetch(new URL('/api/jobs/ingest?limit=5', request.url), { method: 'POST' }).catch(() => {});
    }
    return back('retrying=1');
  }

  return fail('Unknown action.');
};
