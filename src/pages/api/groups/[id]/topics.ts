import type { APIRoute } from 'astro';
import { groupsEnabled } from '../../../../lib/flags';
import { loadSuggestions, retireSuggestion } from '../../../../lib/topicSuggestions';

/**
 * GET /api/groups/:id/topics — suggested topics for the group's owner,
 * computed from what's been shared (cached; recomputed after a few new
 * shares). POST { action: "dismiss", key } stops suggesting one.
 */

async function ownsGroup(locals: App.Locals, groupId: string | undefined): Promise<boolean> {
  if (!locals.user || !groupId) return false;
  const { data } = await locals.supabase.from('groups').select('owner_id').eq('id', groupId).maybeSingle();
  return data?.owner_id === locals.user.id;
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!groupsEnabled()) return Response.json({ error: 'Groups are not enabled.' }, { status: 404 });
  if (!(await ownsGroup(locals, params.id))) {
    return Response.json({ error: 'Only the group owner sees suggestions.' }, { status: 403 });
  }
  const result = await loadSuggestions(locals.supabase, params.id!);
  return Response.json(result);
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!groupsEnabled()) return Response.json({ error: 'Groups are not enabled.' }, { status: 404 });
  if (!(await ownsGroup(locals, params.id))) {
    return Response.json({ error: 'Only the group owner can do that.' }, { status: 403 });
  }
  let key = '';
  try {
    const body = (await request.json()) as { action?: unknown; key?: unknown };
    if (body.action === 'dismiss' && typeof body.key === 'string') key = body.key;
  } catch {
    /* fall through */
  }
  if (!key) return Response.json({ error: 'Nothing to dismiss.' }, { status: 400 });
  const ok = await retireSuggestion(locals.supabase, params.id!, key);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
};
