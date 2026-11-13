-- One-off backfill: re-ingest links that archived before ingest captured
-- thumbnails (metadata->>'image'), so old saves pick up images, oEmbed
-- titles and kinds. Ready links only: failed ones belong to the retry
-- flow, and the conflict guard leaves queued/running jobs alone.
insert into public.ingest_jobs (link_id, status, attempts, last_error, run_after)
select l.id, 'queued', 0, null, now()
from public.links l
where l.status = 'ready'
  and (l.metadata->>'image') is null
on conflict (link_id) do update
  set status = 'queued', attempts = 0, last_error = null, run_after = now(), updated_at = now()
  where ingest_jobs.status in ('done', 'failed');
