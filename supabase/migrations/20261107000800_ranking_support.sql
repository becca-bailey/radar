-- Support for the edition builder: source frequency stats (w(s) in PLAN.md
-- §7), active-member counts, and roundup attribution snapshots.

-- Names of recommenders who opted into published-roundup attribution,
-- snapshotted separately from the in-group display names.
alter table public.edition_links
  add column attribution_names jsonb not null default '[]'::jsonb;

-- a(s): recommendations per source across the system in the last N days.
-- Service role only — these are system-wide numbers.
create function public.source_recommendation_stats (days int default 90)
returns table (source text, cnt bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select l.source, count(*)::bigint as cnt
  from public.recommendations r
  join public.links l on l.id = r.link_id
  where r.created_at >= now() - make_interval(days => days)
    and l.source is not null
  group by l.source;
$$;

revoke all on function public.source_recommendation_stats (int) from public, anon, authenticated;

-- m: members active in the window (saved or shared anything).
create function public.group_active_members (gid uuid, win_start timestamptz, win_end timestamptz)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct m.user_id)::int
  from public.memberships m
  where m.group_id = gid
    and (
      exists (
        select 1 from public.saves s
        where s.user_id = m.user_id and s.created_at >= win_start and s.created_at < win_end
      )
      or exists (
        select 1 from public.recommendations r
        where r.user_id = m.user_id and r.group_id = gid
          and r.created_at >= win_start and r.created_at < win_end
      )
    );
$$;

revoke all on function public.group_active_members (uuid, timestamptz, timestamptz) from public, anon, authenticated;
