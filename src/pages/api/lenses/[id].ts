import type { APIRoute } from 'astro';
import { embedLensQuery, lensHomePath, parseLensForm } from '../../../lib/lenses';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/lenses/:id — manage one lens. The `action` field picks:
 *   edit   — change the name and/or search (re-embeds when the search changes)
 *   delete — remove the lens (saves are untouched)
 * RLS scopes writes to the caller's own lenses, or to lenses of groups the
 * caller owns. Afterwards it returns to wherever the lens lives.
 */
export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user) {
    return redirect('/login');
  }

  const id = params.id ?? '';
  if (!UUID_RE.test(id)) {
    return redirect(`/explore?error=${encodeURIComponent('That lens was not found.')}`);
  }

  // Read first, to know where the lens lives (Explore or a group page).
  const { data: current } = await supabase
    .from('lenses')
    .select('query, group_id')
    .eq('id', id)
    .maybeSingle();
  const groupId: string | null = current?.group_id ?? null;
  const fail = (msg: string, lensId?: string) => {
    const path = lensHomePath(groupId, lensId);
    return redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(msg)}`);
  };
  if (!current) {
    return fail('That lens was not found.');
  }

  const form = await request.formData();
  const action = String(form.get('action') ?? '');

  if (action === 'delete') {
    const { data, error } = await supabase.from('lenses').delete().eq('id', id).select('id');
    if (error) return fail('Could not delete the lens. Try again.', id);
    if (!data?.length) return fail('Only the group owner can change its lenses.', id);
    return redirect(`${lensHomePath(groupId)}?deleted=1`);
  }

  if (action === 'edit') {
    const parsed = parseLensForm(form);
    if ('error' in parsed) return fail(parsed.error, id);

    const patch: Record<string, unknown> = { name: parsed.name, query: parsed.query };
    if (parsed.query !== current.query) {
      patch.query_embedding = await embedLensQuery(parsed.query);
    }
    const { data, error } = await supabase.from('lenses').update(patch).eq('id', id).select('id');
    if (error) return fail('Could not update the lens. Try again.', id);
    if (!data?.length) return fail('Only the group owner can change its lenses.', id);
    return redirect(`${lensHomePath(groupId, id)}&lens_updated=1`);
  }

  return fail('Unknown action.', id);
};
