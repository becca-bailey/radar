-- Suggested topics for groups (2026-11-18). The owner sees topics found in
-- what's been shared and can pin one as a lens. Suggestions are computed in
-- the owner's own request (clustering + one LLM call to name the clusters)
-- and cached here.

-- ---------------------------------------------------------------------------
-- 1. group_pool: a semantic floor that adapts to the pool
-- ---------------------------------------------------------------------------
-- In a focused group (everything is about performance anxiety, say), almost
-- every link clears a fixed 0.3 similarity against a short phrase, so a lens
-- matched nearly the whole pool. Once the pool has 10+ embedded links, a
-- semantic match must also beat the pool's mean similarity to the query by
-- one standard deviation. In a broad group that floor stays under 0.3, so
-- nothing changes there. Keyword matches are unaffected.

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
  where sim > case
    when n >= 10 then greatest(min_similarity, mean_sim + sd_sim)
    else min_similarity
  end
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

-- ---------------------------------------------------------------------------
-- 2. group_topic_pool: the owner's raw material for suggestions
-- ---------------------------------------------------------------------------
-- One row per link shared to the group (not removed, not held), newest share
-- first: title, embedding and when it was last shared. Owner only. Never
-- notes, never who shared it.

create function public.group_topic_pool (
  gid uuid,
  max_links int default 200,
  with_embeddings boolean default true
)
returns table (
  link_id uuid,
  title text,
  embedding text,
  last_shared_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    l.title,
    case when with_embeddings then l.embedding::text end,
    max(sh.shared_at)
  from public.shares sh
  join public.saves s on s.id = sh.save_id
  join public.links l on l.id = s.link_id
  where sh.group_id = gid
    and sh.removed_at is null
    and l.status <> 'held'
    and public.is_group_owner (gid, auth.uid ())
  group by l.id
  order by max(sh.shared_at) desc
  limit max_links;
$$;

-- ---------------------------------------------------------------------------
-- 3. Cache of suggestions, one row per group
-- ---------------------------------------------------------------------------
-- candidates: [{ key, name, query, link_ids }], already checked against the
--   lens search (link_ids is what pinning it would show).
-- dismissed: [{ key, query, link_ids }], dismissed or pinned. A later
--   candidate that mostly overlaps one of these is not suggested again.

create table public.group_topic_suggestions (
  group_id uuid primary key references public.groups (id) on delete cascade,
  computed_at timestamptz not null default now(),
  pool_size int not null default 0,
  candidates jsonb not null default '[]',
  dismissed jsonb not null default '[]'
);

alter table public.group_topic_suggestions enable row level security;

create policy "topic suggestions: owner" on public.group_topic_suggestions
  for all using (public.is_group_owner (group_id, auth.uid ()))
  with check (public.is_group_owner (group_id, auth.uid ()));
