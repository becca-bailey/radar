-- RAD-52: "I made this". A member can mark a share as their own work. The
-- group shows it under "Made by members", apart from recommendations. The
-- count a group sees on a link becomes Radar-wide: everyone who saved it,
-- whether privately or shared to any group. A number only, never who.

-- Set when sharing; like the rest of a share row it never changes afterwards
-- (unshare and share again to change it).
alter table public.shares add column made_by_sharer boolean not null default false;

-- group_pool gains member_made (someone who shared the link says they made
-- it), made_by (those members' nicknames, if they set one) and savers (how
-- many people on Radar saved the link). The return type changes, so drop and
-- recreate; the body is otherwise unchanged.
drop function public.group_pool (uuid, text, public.vector, int, real, timestamptz, timestamptz);

create function public.group_pool (
  gid uuid,
  query text default '',
  query_embedding public.vector (1536) default null,
  match_limit int default 60,
  min_similarity real default 0.3,
  shared_from timestamptz default null,
  shared_before timestamptz default null
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
  last_shared_at timestamptz,
  member_made boolean,
  made_by text[],
  savers int,
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
    max(sh.shared_at) as last_shared_at,
    bool_or(sh.made_by_sharer) as member_made,
    coalesce(
      array_agg(m.display_name order by sh.shared_at) filter (where sh.made_by_sharer and m.display_name is not null),
      '{}'
    ) as made_by
  from public.shares sh
  join public.saves s on s.id = sh.save_id
  left join public.memberships m on m.group_id = sh.group_id and m.user_id = s.user_id
  where sh.group_id = gid
    and sh.removed_at is null
    and public.is_group_member (gid, auth.uid ())
    and (shared_from is null or sh.shared_at >= shared_from)
    and (shared_before is null or sh.shared_at < shared_before)
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
    l.full_text,
    (select count(*)::int from public.saves sv where sv.link_id = p.link_id) as savers
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
)
select
  s.link_id,
  s.title,
  s.canonical_url,
  s.source,
  s.image,
  case
    when kw.link_id is not null then
      ts_headline(
        'english',
        left(coalesce(s.full_text, s.lead_text, ''), 20000),
        websearch_to_tsquery('english', query),
        'StartSel=[[[, StopSel=]]], MaxWords=35, MinWords=15'
      )
    else coalesce(s.lead_text, '')
  end as snippet,
  s.notes,
  s.readers,
  s.names,
  s.picked,
  s.last_shared_at,
  s.member_made,
  s.made_by,
  s.savers,
  (coalesce(kw.kw_rank, 0) * 2.0 + coalesce(sem.sim, 0))::real as rank
from shared s
left join kw on kw.link_id = s.link_id
left join sem on sem.link_id = s.link_id
where query = ''
   or kw.link_id is not null
   or sem.link_id is not null
   or array_to_string(s.notes, ' ') ilike '%' || query || '%'
order by rank desc, s.last_shared_at desc
limit match_limit;
$$;

