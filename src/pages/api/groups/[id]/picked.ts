import type { APIRoute } from 'astro';
import { groupsEnabled } from '../../../../lib/flags';

/**
 * POST /api/groups/:id/picked — the owner marks links as picked (say, used
 * in a newsletter). Members see "picked" on their own share; nobody learns
 * who shared what. JSON body: { link_ids: string[] }.
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!groupsEnabled()) return Response.json({ error: 'Groups are not enabled.' }, { status: 404 });
  const { user, supabase } = locals;
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  let ids: string[] = [];
  try {
    const body = (await request.json()) as { link_ids?: unknown };
    ids = Array.isArray(body.link_ids) ? body.link_ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    /* fall through to the empty check */
  }
  if (ids.length === 0) return Response.json({ error: 'Nothing to mark.' }, { status: 400 });
  const { data, error } = await supabase.rpc('mark_links_picked', { gid: params.id, lids: ids.slice(0, 500) });
  if (error) return Response.json({ error: 'Only the group owner can mark links picked.' }, { status: 403 });
  return Response.json({ marked: data as number });
};
