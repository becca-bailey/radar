import type { APIRoute } from 'astro';
import { processIngestQueue } from '../../../lib/ingest';
import { createServiceClient } from '../../../lib/supabase';

/** Invoked by the scheduled Netlify function (or by hand in dev). */
export const POST: APIRoute = async ({ request, url }) => {
  if (!authorized(request)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '5') || 5, 10);
  const summary = await processIngestQueue(createServiceClient(), limit);
  return Response.json(summary);
};

export function authorized(request: Request): boolean {
  const secret = import.meta.env.CRON_SECRET;
  if (secret && request.headers.get('x-cron-secret') === secret) return true;
  return import.meta.env.DEV;
}
