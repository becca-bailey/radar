// Scheduled trigger for the ingest queue. All logic lives in the Astro app;
// this just pokes it so there is one code path in dev and production.
export default async () => {
  const base = process.env.URL ?? 'http://localhost:4321';
  const res = await fetch(`${base}/api/jobs/ingest?limit=10`, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  });
  return new Response(await res.text(), { status: res.status });
};

export const config = { schedule: '* * * * *' };
