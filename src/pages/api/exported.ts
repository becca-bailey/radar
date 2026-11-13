import type { APIRoute } from 'astro';

/**
 * POST /api/exported — the export pages call this after a copy or download,
 * so next time the date range can start "since your last export". JSON body:
 * { group_id?: string } (absent = your own archive).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  let groupId: string | null = null;
  try {
    const body = (await request.json()) as { group_id?: unknown };
    groupId = typeof body.group_id === 'string' && body.group_id ? body.group_id : null;
  } catch {
    /* empty body: personal export */
  }
  const { error } = await supabase.rpc('mark_exported', { gid: groupId });
  return error ? Response.json({ error: 'Could not record the export.' }, { status: 500 }) : Response.json({ ok: true });
};
