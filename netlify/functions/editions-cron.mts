// Hourly check for due editions; all logic lives in the Astro app.
export default async () => {
  const base = process.env.URL ?? 'http://localhost:4321';
  const res = await fetch(`${base}/api/jobs/editions`, {
    method: 'POST',
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  });
  return new Response(await res.text(), { status: res.status });
};

export const config = { schedule: '17 * * * *' };
