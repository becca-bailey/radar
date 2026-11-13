import type { APIRoute } from 'astro';
import { embedLensQuery, lensHomePath, parseLensForm } from '../../lib/lenses';
import { groupsEnabled } from '../../lib/flags';
import { retireSuggestion } from '../../lib/topicSuggestions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/lenses — create a lens (a saved search), then land on it.
 * Without group_id it's a personal lens on Explore; with one, a group lens
 * on that group's page. RLS fills in the owner and only lets a group's
 * owner add lenses to it.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user) {
    return redirect('/login');
  }

  const form = await request.formData();
  const rawGroup = String(form.get('group_id') ?? '');
  const groupId = groupsEnabled() && UUID_RE.test(rawGroup) ? rawGroup : null;
  const home = lensHomePath(groupId);
  const fail = (msg: string) => redirect(`${home}?error=${encodeURIComponent(msg)}`);

  const parsed = parseLensForm(form);
  if ('error' in parsed) {
    return fail(parsed.error);
  }

  const { data, error } = await supabase
    .from('lenses')
    .insert({
      user_id: user.id,
      group_id: groupId,
      name: parsed.name,
      query: parsed.query,
      query_embedding: await embedLensQuery(parsed.query),
    })
    .select('id')
    .single();
  if (error) {
    return fail('Could not save the lens. Try again.');
  }
  // Pinned from a suggested topic: stop suggesting it, even if the owner
  // changed the search before saving.
  const suggestion = String(form.get('suggestion') ?? '');
  if (groupId && suggestion) await retireSuggestion(supabase, groupId, suggestion);
  return redirect(`${lensHomePath(groupId, data.id)}&created=1`);
};
