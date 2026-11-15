-- Relative semantic cutoff (RAD-42). A one-word query ("Science", "art")
-- scores lower against every link than a phrase does, so its best matches
-- sat around 0.26 and never cleared the fixed 0.3 floor: lenses and search
-- fell back to keyword-only results.
--
-- A semantic match now also counts when it's within 0.06 of the query's
-- best match and above 0.2. Calibrated on production (2026-11-14,
-- text-embedding-3-small): unrelated queries (tax law, football, cars)
-- top out under 0.18, and "Science" now picks up the laundry-microbiology,
-- behavior and neuroscience-of-knitting links. The cutoff never rises
-- above min_similarity, so anything that matched before still matches.
-- group_pool keeps its pool-adaptive floor (mean + 1 sd once 10+ links are
-- embedded) on top, so focused groups don't start matching everything.

create or replace function public.search_archive (
  query text,
  query_embedding vector (1536) default null,
  match_limit int default 30,
  min_similarity real default 0.3
)
returns table (
  save_id uuid,
  link_id uuid,
  title text,
  canonical_url text,
  source text,
  snippet text,
  note text,
  created_at timestamptz,
  rank real
)
language sql
stable
as $$
with mine as (
  select
    s.id as save_id,
    s.link_id,
    s.note,
    s.created_at,
    l.title,
    l.canonical_url,
    l.source,
    l.search_tsv,
    l.embedding,
    l.lead_text,
    l.full_text
  from public.saves s
  join public.links l on l.id = s.link_id
  where s.user_id = auth.uid ()
),
kw as (
  select save_id, ts_rank(search_tsv, websearch_to_tsquery('english', query)) as kw_rank
  from mine
  where query <> '' and search_tsv @@ websearch_to_tsquery('english', query)
),
nearest as (
  select save_id, sim, max(sim) over () as best_sim
  from (
    select save_id, 1 - (embedding <=> query_embedding) as sim
    from mine
    where query_embedding is not null and embedding is not null
    order by embedding <=> query_embedding
    limit match_limit
  ) top
),
sem as (
  select save_id, sim
  from nearest
  where sim > least(min_similarity, greatest(0.2, best_sim - 0.06))
)
select
  m.save_id,
  m.link_id,
  m.title,
  m.canonical_url,
  m.source,
  case
    when kw.save_id is not null then
      ts_headline(
        'english',
        left(coalesce(m.full_text, m.lead_text, ''), 20000),
        websearch_to_tsquery('english', query),
        -- Custom markers so the app can escape page HTML safely and then
        -- turn only these into highlight tags.
        'StartSel=[[[, StopSel=]]], MaxWords=35, MinWords=15'
      )
    else coalesce(m.lead_text, '')
  end as snippet,
  m.note,
  m.created_at,
  (coalesce(kw.kw_rank, 0) * 2.0 + coalesce(sem.sim, 0))::real as rank
from mine m
left join kw on kw.save_id = m.save_id
left join sem on sem.save_id = m.save_id
where kw.save_id is not null
   or sem.save_id is not null
   or (query <> '' and m.note ilike '%' || query || '%')
order by rank desc, m.created_at desc
limit match_limit;
$$;

create or replace function public.group_pool (
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
    max(sh.shared_at) as last_shared_at
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

