-- Simplify groups (2026-11-16).
--
-- A group is a pool of saves its members share, viewed through lenses the
-- owner sets up and exported by any member. Gone: scheduled editions and
-- their emails, the public layer and its flag queue, and most group
-- settings.
--
-- Shares: a save belongs to its user and can be shared to many groups. A
-- share is just that link (save × group). The group sees the save's link
-- and note, never who saved it: shares carry no user id, and members read a
-- group only through group_pool, which returns counts and notes. When the
-- owner removes a link from the group, its shares there are marked removed;
-- the saves, and their shares to other groups, are untouched.

-- ---------------------------------------------------------------------------
-- 1. Editions, the public layer and flags
-- ---------------------------------------------------------------------------

-- Links are readable only by people who saved them. Group members see a
-- shared link's title and URL through group_pool instead.
drop policy "links: saved or shared with you" on public.links;

create policy "links: saved by you" on public.links
  for select using (
    exists (
      select 1 from public.saves s
      where s.link_id = links.id and s.user_id = auth.uid ()
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
-- 3. Group lenses: saved searches over the group's pool, set by the owner
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
-- 4. Shares: save × group, replacing recommendations
-- ---------------------------------------------------------------------------

create table public.shares (
  save_id uuid not null references public.saves (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  shared_at timestamptz not null default now(),
  -- Set when the group's owner removes the link from the group.
  removed_at timestamptz,
  primary key (save_id, group_id)
);

create index shares_group_idx on public.shares (group_id, shared_at desc);

-- Carry existing shares over. The note now comes from the save itself, so a
-- note that was edited only for one group is replaced by the save's note.
insert into public.shares (save_id, group_id, shared_at)
select save_id, group_id, created_at from public.recommendations
on conflict do nothing;

drop table public.recommendations;

-- True when the owner removed this save's link from the group (someone's
-- share of it is marked removed). Blocks sharing it there again.
create function public.link_removed_from_group (gid uuid, sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.shares sh
    join public.saves s on s.id = sh.save_id
    where sh.group_id = gid
      and sh.removed_at is not null
      and s.link_id = (select link_id from public.saves where id = sid)
  );
$$;

alter table public.shares enable row level security;

-- You see and manage the shares of your own saves. Nobody reads anyone
-- else's share rows; groups are read through group_pool.
create policy "shares: read own" on public.shares
  for select using (
    exists (select 1 from public.saves s where s.id = save_id and s.user_id = auth.uid ())
  );

create policy "shares: share own saves to your groups" on public.shares
  for insert with check (
    removed_at is null
    and public.is_group_member (group_id, auth.uid ())
    and exists (select 1 from public.saves s where s.id = save_id and s.user_id = auth.uid ())
    and not public.link_removed_from_group (group_id, save_id)
  );

-- Unsharing is yours, but a removed share stays put so it keeps blocking.
create policy "shares: unshare own" on public.shares
  for delete using (
    removed_at is null
    and exists (select 1 from public.saves s where s.id = save_id and s.user_id = auth.uid ())
  );

-- No update policy: removed_at changes only through the owner functions.

-- ---------------------------------------------------------------------------
-- 5. Owner moderation: remove a link from the group, or restore it
-- ---------------------------------------------------------------------------

create function public.remove_link_from_group (gid uuid, lid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.is_group_owner (gid, auth.uid ()) then
    raise exception 'Only the group owner can remove links.' using errcode = '42501';
  end if;
  update public.shares sh
  set removed_at = now()
  from public.saves s
  where s.id = sh.save_id and sh.group_id = gid and s.link_id = lid and sh.removed_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.restore_link_to_group (gid uuid, lid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.is_group_owner (gid, auth.uid ()) then
    raise exception 'Only the group owner can restore links.' using errcode = '42501';
  end if;
  update public.shares sh
  set removed_at = null
  from public.saves s
  where s.id = sh.save_id and sh.group_id = gid and s.link_id = lid and sh.removed_at is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The owner's list of removed links, newest first.
create function public.group_removed_links (gid uuid)
returns table (link_id uuid, title text, canonical_url text, removed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.title, l.canonical_url, max(sh.removed_at)
  from public.shares sh
  join public.saves s on s.id = sh.save_id
  join public.links l on l.id = s.link_id
  where sh.group_id = gid
    and sh.removed_at is not null
    and public.is_group_owner (gid, auth.uid ())
  group by l.id, l.title, l.canonical_url
  order by max(sh.removed_at) desc;
$$;

-- ---------------------------------------------------------------------------
-- 6. group_pool: the group's links, one row per link, optionally searched
-- ---------------------------------------------------------------------------

-- Security definer, with an explicit membership check: it reads other
-- members' saves, which their RLS hides, and returns only what the group
-- may see (link, note, count). An empty query returns the whole pool,
-- newest share first; otherwise the same keyword + semantic ranking as
-- search_archive. Removed shares and held links are left out.
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
    -- One save per user per link, so this counts members.
    count(*)::int as readers,
    max(sh.shared_at) as last_shared_at
  from public.shares sh
  join public.saves s on s.id = sh.save_id
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
sem as (
  select link_id, sim
  from (
    select link_id, 1 - (embedding operator(public.<=>) query_embedding) as sim
    from shared
    where query <> '' and query_embedding is not null and embedding is not null
    order by embedding operator(public.<=>) query_embedding
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
