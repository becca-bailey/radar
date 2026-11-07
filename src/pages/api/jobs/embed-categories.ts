import type { APIRoute } from 'astro';
import { embedCategoryDescriptions } from '../../../lib/categorize';
import { createServiceClient } from '../../../lib/supabase';
import { authorized } from './ingest';

/** One-off: embed the category taxonomy descriptions. Needs OPENAI_API_KEY. */
export const POST: APIRoute = async ({ request }) => {
  if (!authorized(request)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const embedded = await embedCategoryDescriptions(createServiceClient());
    return Response.json({ embedded });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
};
