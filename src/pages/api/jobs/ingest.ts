import type { APIRoute } from 'astro';
import { processIngestQueue } from '../../../lib/ingest';
import { processWaybackRequests } from '../../../lib/wayback';
import { createServiceClient } from '../../../lib/supabase';

/** Invoked by the scheduled Netlify function (or by hand in dev). */
export const POST: APIRoute = async ({ request, url }) => {
  if (!authorized(request)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '5') || 5, 10);
  const service = createServiceClient();
  const summary = await processIngestQueue(service, limit);
  const waybackSaved = await processWaybackRequests(service).catch(() => 0);
  return Response.json({ ...summary, waybackSaved });
};

export function authorized(request: Request): boolean {
  const secret = import.meta.env.CRON_SECRET;
  if (secret && request.headers.get('x-cron-secret') === secret) return true;
  return import.meta.env.DEV;
}
