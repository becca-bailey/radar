-- One-off repair: links whose canonical_url was truncated at an HTML entity.
--
-- Before the htmlEntities fix, a canonical href like
--   https://www.threads.com/&#064;user/post/ID
-- was parsed with `#064;user/post/ID` as a fragment, which normalization
-- stripped, leaving `https://www.threads.com/&`. Ingest renamed the link to
-- that URL, and every later post from the same site merged into it
-- (merge_links), so one link row can hold saves of many different posts.
--
-- ORDER MATTERS: deploy the decoder fix first. A requeued job running on the
-- old code recomputes the truncated URL and undoes this repair.
--
-- What it does, per truncated link (canonical ending in `&`):
--   * The earliest save keeps the existing row; the row is renamed to that
--     save's original_url.
--   * Each other distinct original_url gets its own link row (or an existing
--     row at exactly that URL). Its saves and their recommendations move there.
--   * Every touched link is requeued. Ingest then refetches, sets the real
--     canonical (merging rows that turn out to be the same post), and rewrites
--     the title, source and archive.
--
-- It can't restore saves that merge_links already deleted: a user who saved
-- two posts from the site kept only the save on the surviving row.
--
-- Usage:
--   psql "$DB_URL" -v apply=0 -f scripts/repair-truncated-canonicals.sql   # dry run (default)
--   psql "$DB_URL" -v apply=1 -f scripts/repair-truncated-canonicals.sql   # write

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

begin;

\echo '--- truncated links'
select l.id, l.canonical_url, l.status, l.title,
       (select count(*) from public.saves s where s.link_id = l.id) as saves,
       (select count(distinct s.original_url) from public.saves s where s.link_id = l.id) as distinct_urls,
       (select count(*) from public.edition_links e where e.link_id = l.id) as edition_links,
       (select count(*) from public.flags f where f.link_id = l.id) as flags
from public.links l
where l.canonical_url ~ '^https?://[^?#]*&$';

\echo '--- saves on them (first row per link keeps the existing link)'
select s.link_id, s.id as save_id, s.user_id, s.original_url, s.created_at
from public.saves s
join public.links l on l.id = s.link_id
where l.canonical_url ~ '^https?://[^?#]*&$'
order by s.link_id, s.created_at;

do $$
declare
  bad record;
  keep_url text;
  grp record;
  target uuid;
  moved int;
begin
  for bad in
    select id, canonical_url from public.links
    where canonical_url ~ '^https?://[^?#]*&$'
  loop
    select original_url into keep_url
    from public.saves where link_id = bad.id
    order by created_at, id limit 1;

    if keep_url is null then
      -- Nothing to recover a real URL from, and no user sees it. Leave it.
      raise notice 'link % (%) has no saves; left untouched', bad.id, bad.canonical_url;
      continue;
    else
      -- Every other distinct original URL moves to its own link.
      for grp in
        select original_url, min(created_at) as first_at
        from public.saves
        where link_id = bad.id and original_url <> keep_url
        group by original_url
        order by first_at
      loop
        select id into target from public.links where canonical_url = grp.original_url;
        if target is null then
          insert into public.links (canonical_url)
          values (grp.original_url)
          returning id into target;
        end if;

        -- Same rule as merge_links: a user already saved on the target keeps
        -- that save, and the duplicate here goes.
        delete from public.saves s
        using public.saves t
        where s.link_id = bad.id and s.original_url = grp.original_url
          and t.link_id = target and t.user_id = s.user_id;

        update public.recommendations r
        set link_id = target
        from public.saves s
        where r.save_id = s.id and s.link_id = bad.id and s.original_url = grp.original_url;

        update public.saves
        set link_id = target
        where link_id = bad.id and original_url = grp.original_url;
        get diagnostics moved = row_count;

        insert into public.ingest_jobs (link_id, status, attempts, last_error, run_after)
        values (target, 'queued', 0, null, now())
        on conflict (link_id) do update
          set status = 'queued', attempts = 0, last_error = null, run_after = now(), updated_at = now();

        raise notice 'moved % save(s) of % to link %', moved, grp.original_url, target;
      end loop;

      if exists (select 1 from public.links where canonical_url = keep_url and id <> bad.id) then
        -- The kept URL already has its own row: fold this one into it.
        select id into target from public.links where canonical_url = keep_url and id <> bad.id;
        perform public.merge_links(bad.id, target);
        insert into public.ingest_jobs (link_id, status, attempts, last_error, run_after)
        values (target, 'queued', 0, null, now())
        on conflict (link_id) do update
          set status = 'queued', attempts = 0, last_error = null, run_after = now(), updated_at = now();
        raise notice 'merged link % into existing link % (%)', bad.id, target, keep_url;
        continue;
      end if;

      update public.links set canonical_url = keep_url where id = bad.id;
      raise notice 'renamed link % to %', bad.id, keep_url;
    end if;

    insert into public.ingest_jobs (link_id, status, attempts, last_error, run_after)
    values (bad.id, 'queued', 0, null, now())
    on conflict (link_id) do update
      set status = 'queued', attempts = 0, last_error = null, run_after = now(), updated_at = now();
  end loop;
end;
$$;

\echo '--- after'
select l.id, l.canonical_url, j.status as job,
       (select count(*) from public.saves s where s.link_id = l.id) as saves
from public.links l
left join public.ingest_jobs j on j.link_id = l.id
-- now() is fixed for the transaction, so this is exactly the rows requeued above.
where l.id in (select link_id from public.ingest_jobs where run_after = now())
order by l.canonical_url;

\if :apply
  commit;
  \echo 'Committed.'
\else
  rollback;
  \echo 'Dry run: rolled back. Re-run with -v apply=1 to write.'
\endif
