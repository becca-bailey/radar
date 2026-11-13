import type { APIRoute } from 'astro';
import { embedLensQuery, parseLensForm } from '../../../lib/lenses';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/lenses/:id — manage one lens. The `action` field picks:
 *   edit   — change the name and/or search (re-embeds when the search changes)
 *   delete — remove the lens (saves are untouched)
 * RLS scopes every read and write to the caller's own lenses.
 */
export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user) {
    return redirect('/login');
  }

  const id = params.id ?? '';
  const fail = (msg: string, lensId?: string) =>
    redirect(`/explore?${lensId ? `lens=${lensId}&` : ''}error=${encodeURIComponent(msg)}`);
  if (!UUID_RE.test(id)) {
    return fail('That lens was not found.');
  }

  const form = await request.formData();
  const action = String(form.get('action') ?? '');

  if (action === 'delete') {
    const { data, error } = await supabase.from('lenses').delete().eq('id', id).select('id');
    if (error) return fail('Could not delete the lens. Try again.', id);
    if (!data?.length) return fail('That lens was not found.');
    return redirect('/explore?deleted=1');
  }

  if (action === 'edit') {
    const parsed = parseLensForm(form);
    if ('error' in parsed) return fail(parsed.error, id);

    const { data: current } = await supabase.from('lenses').select('query').eq('id', id).maybeSingle();
    if (!current) return fail('That lens was not found.');

    const patch: Record<string, unknown> = { name: parsed.name, query: parsed.query };
    if (parsed.query !== current.query) {
      patch.query_embedding = await embedLensQuery(parsed.query);
    }
    const { error } = await supabase.from('lenses').update(patch).eq('id', id);
    if (error) return fail('Could not update the lens. Try again.', id);
    return redirect(`/explore?lens=${id}&lens_updated=1`);
  }

  return fail('Unknown action.', id);
};
