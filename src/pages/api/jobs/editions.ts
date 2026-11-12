import type { APIRoute } from 'astro';
import { buildDueEditions } from '../../../lib/editions';
import { groupsEnabled } from '../../../lib/flags';
import { createServiceClient } from '../../../lib/supabase';
import { authorized } from './ingest';

/** Invoked hourly by the scheduled Netlify function (or by hand in dev). */
export const POST: APIRoute = async ({ request }) => {
  if (!authorized(request)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!groupsEnabled()) {
    return Response.json({ built: 0, skipped: 'groups disabled' });
  }
  try {
    const result = await buildDueEditions(createServiceClient());
    return Response.json(result);
  } catch (err) {
    console.error('edition build failed:', err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
};
