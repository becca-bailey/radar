import type { APIRoute } from 'astro';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/saves/status?ids=<uuid,uuid,…> — archive status per save, for the
 * archive page's "archiving…" poll. RLS scopes to the caller's own saves.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { user, supabase } = locals;
  if (!user) {
    return Response.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .filter((id) => UUID_RE.test(id))
    .slice(0, 100);
  if (ids.length === 0) {
    return Response.json({});
  }

  const { data, error } = await supabase.from('saves').select('id, links(status)').in('id', ids);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const statuses: Record<string, string> = {};
  for (const row of data ?? []) {
    const link = row.links as unknown as { status: string } | null;
    statuses[row.id as string] = link?.status ?? 'pending';
  }
  return new Response(JSON.stringify(statuses), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
