-- RAD-52: "I made this". Members can keep their own work (essays,
-- newsletters, patterns) apart from the links they save to read later, in
-- their archive and in every group they share it to.
--
-- saves.own_work marks a save as the saver's own work. It belongs to the
-- save, so it's set when saving (web form, Shortcut) and changed from the
-- save's menu; the existing "saves: all own" policy already lets owners
-- update their saves. A group sees it only on saves shared there.
--
-- group_pool gains:
--   own_work      some share of the link in the result is of a flagged save.
--   saved_by      how many people on Radar saved the link, in any group or
--                 privately. A number only, never who, and null below 2, so
--                 the database never says "only the sharer saved this".
--   member_work   filter on each share's save, before grouping: null lists
--                 every share, true only shares of flagged saves, false only
--                 the rest. So one member flagging their save never moves
--                 another member's recommendation of the same link, and a
--                 link someone made and someone else recommended shows in
--                 both lists, each with its own notes and names.
--
-- The return type changes, so the function is dropped and recreated.

alter table public.saves add column own_work boolean not null default false;

-- "Made by you" in the archive: a person's own work, newest first.
create index saves_user_own_work_idx on public.saves (user_id, created_at desc) where own_work;

-- restore_save rebuilds a trashed save from its JSON with
-- jsonb_populate_record, which leaves a missing key null, not the default.
-- Saves trashed before this migration need the key or Undo would fail.
update public.save_trash
set save = save || '{"own_work": false}'::jsonb
where not save ? 'own_work';

-- When ingest merges two links and a person saved both, their save of the
-- old link is dropped. Keep "I made this" if either save had it.
create or replace function public.merge_links (old_id uuid, new_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.saves t
  set own_work = true
  from public.saves s
  where s.link_id = old_id
    and t.link_id = new_id
    and t.user_id = s.user_id
    and s.own_work
    and not t.own_work;

  -- Drop saves that would collide (user already saved the surviving link).
  delete from public.saves s
  using public.saves t
  where s.link_id = old_id
    and t.link_id = new_id
    and t.user_id = s.user_id;

  update public.saves set link_id = new_id where link_id = old_id;

  -- Cascades the old ingest job.
  delete from public.links where id = old_id;
end;
$$;
revoke all on function public.merge_links (uuid, uuid) from public, anon, authenticated;

drop function public.group_pool (uuid, text, public.vector, int, real, timestamptz, timestamptz);

create function public.group_pool (
  gid uuid,
  query text default '',
  query_embedding public.vector (1536) default null,
  match_limit int default 60,
  min_similarity real default 0.3,
  shared_from timestamptz default null,
  shared_before timestamptz default null,
  member_work boolean default null
)
returns table (
  link_id uuid,
  title text,
  canonical_url text,
  source text,
  image text,
  snippet text,
  notes text[],
  readers int,
  names text[],
  picked boolean,
  own_work boolean,
  saved_by int,
  last_shared_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = ''
as $$
with pool as (
  select
    s.link_id,
    coalesce(
      array_agg(s.note order by sh.shared_at) filter (where nullif(btrim(s.note), '') is not null),
      '{}'
    ) as notes,
    count(*)::int as readers,
    coalesce(
      array_agg(m.display_name order by sh.shared_at) filter (where m.display_name is not null),
      '{}'
    ) as names,
    bool_or(sh.picked_at is not null) as picked,
    bool_or(s.own_work) as own_work,
    max(sh.shared_at) as last_shared_at
  from public.shares sh
  join public.saves s on s.id = sh.save_id
  left join public.memberships m on m.group_id = sh.group_id and m.user_id = s.user_id
  where sh.group_id = gid
    and sh.removed_at is null
    and public.is_group_member (gid, auth.uid ())
    and (shared_from is null or sh.shared_at >= shared_from)
    and (shared_before is null or sh.shared_at < shared_before)
    and (member_work is null or s.own_work = member_work)
  group by s.link_id
),
shared as (
  select
    p.*,
    l.title,
    l.canonical_url,
    l.source,
    l.metadata ->> 'image' as image,
    l.search_tsv,
    l.embedding,
    l.lead_text,
    l.full_text
  from pool p
  join public.links l on l.id = p.link_id
  where l.status <> 'held'
),
kw as (
  select link_id, ts_rank(search_tsv, websearch_to_tsquery('english', query)) as kw_rank
  from shared
  where query <> '' and search_tsv @@ websearch_to_tsquery('english', query)
),
scored as (
  select
    link_id,
    sim,
    count(*) over () as n,
    max(sim) over () as best_sim,
    avg(sim) over () as mean_sim,
    coalesce(stddev_pop(sim) over (), 0) as sd_sim
  from (
    select link_id, 1 - (embedding operator(public.<=>) query_embedding) as sim
    from shared
    where query <> '' and query_embedding is not null and embedding is not null
  ) raw
),
sem as (
  select link_id, sim
  from scored
  where sim > greatest(
    least(min_similarity, greatest(0.2, best_sim - 0.06)),
    case when n >= 10 then mean_sim + sd_sim else 0 end
  )
  order by sim desc
  limit match_limit
),
matched as (
  select
    s.*,
    kw.link_id is not null as kw_hit,
    (coalesce(kw.kw_rank, 0) * 2.0 + coalesce(sem.sim, 0))::real as rank
  from shared s
  left join kw on kw.link_id = s.link_id
  left join sem on sem.link_id = s.link_id
  where query = ''
     or kw.link_id is not null
     or sem.link_id is not null
     or array_to_string(s.notes, ' ') ilike '%' || query || '%'
  order by rank desc, s.last_shared_at desc
  limit match_limit
)
select
  m.link_id,
  m.title,
  m.canonical_url,
  m.source,
  m.image,
  case
    when m.kw_hit then
      ts_headline(
        'english',
        left(coalesce(m.full_text, m.lead_text, ''), 20000),
        websearch_to_tsquery('english', query),
        'StartSel=[[[, StopSel=]]], MaxWords=35, MinWords=15'
      )
    else coalesce(m.lead_text, '')
  end as snippet,
  m.notes,
  m.readers,
  m.names,
  m.picked,
  m.own_work,
  nullif(greatest(c.n, 1), 1) as saved_by,
  m.last_shared_at,
  m.rank
from matched m
cross join lateral (
  select count(*)::int as n from public.saves sv where sv.link_id = m.link_id
) c
order by m.rank desc, m.last_shared_at desc;
$$;
