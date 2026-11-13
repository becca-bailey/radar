-- Simplify groups (2026-11-16).
--
-- A group is now a shared pool of links its members recommend, viewed
-- through lenses the owner sets up and exported by any member. Gone:
-- scheduled editions and their emails, the public layer and its flag queue,
-- and most group settings. Names are never shown: there is no display name
-- shown to a group yet (a possible later addition), so recommendations are
-- anonymous to everyone, the owner included.

-- ---------------------------------------------------------------------------
-- 1. Editions, the public layer and flags
-- ---------------------------------------------------------------------------

-- The links policy and orphan cleanup referenced edition_links; redefine
-- both without it before dropping the tables.
drop policy "links: saved or shared with you" on public.links;

create policy "links: saved or shared with you" on public.links
  for select using (
    exists (
      select 1 from public.saves s
      where s.link_id = links.id and s.user_id = auth.uid ()
    )
    or exists (
      select 1 from public.recommendations r
      where r.link_id = links.id and public.is_group_member (r.group_id, auth.uid ())
    )
  );

create or replace function public.delete_orphan_links (link_ids uuid[])
returns integer
language sql
as $$
  with gone as (
    delete from public.links l
    where l.id = any (link_ids)
      and not exists (select 1 from public.saves s where s.link_id = l.id)
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke execute on function public.delete_orphan_links (uuid[]) from public, anon, authenticated;

drop table public.edition_links;
drop table public.editions;
drop table public.flags;
drop function public.source_recommendation_stats (int);
drop function public.group_active_members (uuid, timestamptz, timestamptz);

-- ---------------------------------------------------------------------------
-- 2. Fewer settings, no names
-- ---------------------------------------------------------------------------

alter table public.groups
  drop column cadence,
  drop column edition_size,
  drop column names_visible,
  drop column contribute_public,
  drop column categories_enabled,
  drop column per_source_cap;

alter table public.recommendations drop column attribution_ok;

-- Members no longer see each other's profiles or membership rows. You see
-- your own membership; the owner sees all of them (for the member count).
drop policy "profiles: visible to shared-group members" on public.profiles;
drop function public.shares_group_with (uuid, uuid);

drop policy "memberships: members read" on public.memberships;

create policy "memberships: own or owner reads" on public.memberships
  for select using (
    user_id = auth.uid () or public.is_group_owner (group_id, auth.uid ())
  );

-- ---------------------------------------------------------------------------
-- 3. Moderation: the owner can remove a link from the group
-- ---------------------------------------------------------------------------

-- Removing deletes every recommendation of the link in the group and
-- records it here, so it can't be shared back. Members can read the list
-- (so the share form can explain a refusal); only the owner changes it.
-- Title and URL are snapshots: once its shares are gone, the owner may no
-- longer be able to read the link row itself.
create table public.group_removed_links (
  group_id uuid not null references public.groups (id) on delete cascade,
  link_id uuid not null references public.links (id) on delete cascade,
  title text,
  canonical_url text not null,
  removed_at timestamptz not null default now(),
  primary key (group_id, link_id)
);

alter table public.group_removed_links enable row level security;

create policy "group_removed_links: members read" on public.group_removed_links
  for select using (public.is_group_member (group_id, auth.uid ()));

create policy "group_removed_links: owner adds" on public.group_removed_links
  for insert with check (public.is_group_owner (group_id, auth.uid ()));

create policy "group_removed_links: owner restores" on public.group_removed_links
  for delete using (public.is_group_owner (group_id, auth.uid ()));

drop policy "recommendations: share own saves" on public.recommendations;

create policy "recommendations: share own saves" on public.recommendations
  for insert with check (
    user_id = auth.uid ()
    and public.is_group_member (group_id, auth.uid ())
    and exists (
      select 1 from public.saves s
      where s.id = save_id and s.user_id = auth.uid () and s.link_id = link_id
    )
    and not exists (
      select 1 from public.group_removed_links g
      where g.group_id = recommendations.group_id and g.link_id = recommendations.link_id
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Group lenses: saved searches over the group's pool, set by the owner
-- ---------------------------------------------------------------------------

-- Same table as personal lenses. group_id null = personal (yours only);
-- set = a group lens every member sees and only the group owner manages.
alter table public.lenses
  add column group_id uuid references public.groups (id) on delete cascade;

create index lenses_group_created_idx on public.lenses (group_id, created_at)
  where group_id is not null;

drop policy "lenses: all own" on public.lenses;

create policy "lenses: read own or your groups'" on public.lenses
  for select using (
    (group_id is null and user_id = auth.uid ())
    or (group_id is not null and public.is_group_member (group_id, auth.uid ()))
  );

create policy "lenses: create own or as group owner" on public.lenses
  for insert with check (
    user_id = auth.uid ()
    and (group_id is null or public.is_group_owner (group_id, auth.uid ()))
  );

create policy "lenses: edit own or as group owner" on public.lenses
  for update using (
    (group_id is null and user_id = auth.uid ())
    or (group_id is not null and public.is_group_owner (group_id, auth.uid ()))
  )
  with check (
    (group_id is null and user_id = auth.uid ())
    or (group_id is not null and public.is_group_owner (group_id, auth.uid ()))
  );

create policy "lenses: delete own or as group owner" on public.lenses
  for delete using (
    (group_id is null and user_id = auth.uid ())
    or (group_id is not null and public.is_group_owner (group_id, auth.uid ()))
  );

-- ---------------------------------------------------------------------------
-- 5. group_pool: the group's links, one row per link, optionally searched
-- ---------------------------------------------------------------------------

-- Security invoker: RLS on recommendations limits this to groups you're in.
-- An empty query returns the whole pool, newest share first; otherwise the
-- same keyword + semantic ranking as search_archive. Shares are aggregated
-- per link (how many members, every note) and never carry who shared.
create function public.group_pool (
  gid uuid,
  query text default '',
  query_embedding vector (1536) default null,
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
  last_shared_at timestamptz,
  rank real
)
language sql
stable
as $$
with pool as (
  select
    r.link_id,
    coalesce(
      array_agg(r.note order by r.created_at) filter (where nullif(btrim(r.note), '') is not null),
      '{}'
    ) as notes,
    count(distinct r.user_id)::int as readers,
    max(r.created_at) as last_shared_at
  from public.recommendations r
  where r.group_id = gid
    and (shared_from is null or r.created_at >= shared_from)
    and (shared_before is null or r.created_at < shared_before)
  group by r.link_id
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
sem as (
  select link_id, sim
  from (
    select link_id, 1 - (embedding <=> query_embedding) as sim
    from shared
    where query <> '' and query_embedding is not null and embedding is not null
    order by embedding <=> query_embedding
    limit match_limit
  ) nearest
  where sim > min_similarity
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
