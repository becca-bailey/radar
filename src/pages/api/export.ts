import type { APIRoute } from 'astro';

interface ExportRow {
  original_url: string;
  note: string | null;
  sentence: string | null;
  created_at: string;
  links: {
    canonical_url: string;
    title: string | null;
    source: string | null;
    lead_text: string | null;
    full_text: string | null;
    status: string;
  } | null;
}

/**
 * GET /api/export?format=markdown|json — the whole archive, full text
 * included, no gating (PLAN.md §2: export always on).
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { user, supabase } = locals;
  if (!user) {
    return Response.json({ error: 'Sign in to export.' }, { status: 401 });
  }

  const format = url.searchParams.get('format') === 'json' ? 'json' : 'markdown';

  // RLS scopes to the user's own saves.
  const { data, error } = await supabase
    .from('saves')
    .select(
      'original_url, note, sentence, created_at, links(canonical_url, title, source, lead_text, full_text, status)'
    )
    .order('created_at', { ascending: true });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ExportRow[];
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    const body = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        count: rows.length,
        saves: rows.map((r) => ({
          saved_at: r.created_at,
          original_url: r.original_url,
          canonical_url: r.links?.canonical_url ?? null,
          title: r.links?.title ?? null,
          source: r.links?.source ?? null,
          sentence: r.sentence,
          note: r.note,
          lead_text: r.links?.lead_text ?? null,
          full_text: r.links?.full_text ?? null,
        })),
      },
      null,
      2
    );
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="archive-${stamp}.json"`,
      },
    });
  }

  const parts: string[] = [`# Reading archive\n\nExported ${stamp}. ${rows.length} saves.\n`];
  for (const r of rows) {
    const title = r.links?.title ?? r.links?.canonical_url ?? r.original_url;
    parts.push(`\n---\n\n## ${title}\n`);
    parts.push(`- URL: ${r.links?.canonical_url ?? r.original_url}`);
    if (r.links?.source) parts.push(`- Source: ${r.links.source}`);
    parts.push(`- Saved: ${r.created_at.slice(0, 10)}`);
    if (r.sentence) parts.push(`- Why: ${r.sentence}`);
    if (r.note) parts.push(`\n### Note\n\n${r.note}`);
    if (r.links?.full_text) parts.push(`\n### Archived text\n\n${r.links.full_text}`);
  }
  return new Response(parts.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="archive-${stamp}.md"`,
    },
  });
};
