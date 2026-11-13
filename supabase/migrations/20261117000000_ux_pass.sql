-- UX pass (2026-11-17): undo instead of confirm, group visits and "new
-- since your last visit", an anonymous "picked" marker, optional per-group
-- nicknames, export-since-last-time, and a Shortcut note setting.

-- ---------------------------------------------------------------------------
-- 1. Undo delete: a one-day trash
-- ---------------------------------------------------------------------------

-- Deleting a save snapshots it (and its shares) here first, so "Undo" can
-- put it back exactly: same id, date, note and group shares, including
-- shares an owner removed (so the removal keeps blocking). Rows older than a
-- day are cleared on the next delete. Only the functions below touch it.
create table public.save_trash (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  save jsonb not null,
  shares jsonb not null default '[]'::jsonb,
  deleted_at timestamptz not null default now()
);

create index save_trash_user_idx on public.save_trash (user_id, deleted_at);

alter table public.save_trash enable row level security;
-- No policies: trash_save / restore_save only.

create function public.trash_save (sid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.saves;
  tid uuid;
begin
  select * into s from public.saves where id = sid and user_id = auth.uid ();
  if not found then
    return null;
  end if;
  delete from public.save_trash
  where user_id = auth.uid () and deleted_at < now() - interval '1 day';
  insert into public.save_trash (user_id, save, shares)
  values (
    auth.uid (),
    to_jsonb (s),
    coalesce((select jsonb_agg(to_jsonb (sh)) from public.shares sh where sh.save_id = sid), '[]'::jsonb)
  )
  returning id into tid;
  delete from public.saves where id = sid;
  return tid;
end;
$$;

create function public.restore_save (tid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.save_trash;
  sid uuid;
begin
  select * into t from public.save_trash
  where id = tid and user_id = auth.uid () and deleted_at > now() - interval '1 day';
  if not found then
    return null;
  end if;
  -- Saved the same link again since deleting it: keep the newer save.
  if exists (
    select 1 from public.saves
    where user_id = auth.uid () and link_id = (t.save ->> 'link_id')::uuid
  ) then
    delete from public.save_trash where id = tid;
    return null;
  end if;
  insert into public.saves select * from jsonb_populate_record (null::public.saves, t.save)
  returning id into sid;
  -- Groups you've since left don't get the share back.
  insert into public.shares
  select * from jsonb_populate_recordset (null::public.shares, t.shares) sh
  where public.is_group_member (sh.group_id, auth.uid ())
  on conflict do nothing;
  delete from public.save_trash where id = tid;
  return sid;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Group visits: "4 new" in the nav, a divider on the group page
-- ---------------------------------------------------------------------------

alter table public.memberships
  add column last_visited_at timestamptz,
  add column last_export_at timestamptz,
  -- Optional nickname shown on your shares in this group only. Null means
  -- anonymous, the default.
  add column display_name text check (display_name is null or char_length(display_name) between 1 and 40);

-- Marks the group visited now; returns the previous visit (null on the
-- first), so the page can draw "since your last visit".
create function public.mark_group_visited (gid uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  with prev as (
    select last_visited_at from public.memberships
    where group_id = gid and user_id = auth.uid ()
  ),
  upd as (
    update public.memberships set last_visited_at = now()
    where group_id = gid and user_id = auth.uid ()
  )
  select last_visited_at from prev;
$$;

-- Shares from others since your last visit (or since you joined), per group.
create function public.my_group_news ()
returns table (group_id uuid, new_count int)
language sql
stable
security definer
set search_path = ''
as $$
  select m.group_id, count(sh.save_id)::int
  from public.memberships m
  join public.shares sh on sh.group_id = m.group_id
  join public.saves s on s.id = sh.save_id
  where m.user_id = auth.uid ()
    and sh.removed_at is null
    and s.user_id <> auth.uid ()
    and sh.shared_at > coalesce(m.last_visited_at, m.created_at)
  group by m.group_id;
$$;

create function public.set_group_display_name (gid uuid, name text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.memberships
  set display_name = nullif(left(btrim(name), 40), '')
  where group_id = gid and user_id = auth.uid ();
$$;

-- ---------------------------------------------------------------------------
-- 3. Picked: the owner marks links they used (say, in a newsletter)
-- ---------------------------------------------------------------------------

alter table public.shares add column picked_at timestamptz;

create function public.mark_links_picked (gid uuid, lids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.is_group_owner (gid, auth.uid ()) then
    raise exception 'Only the group owner can mark links picked.' using errcode = '42501';
  end if;
  update public.shares sh
  set picked_at = now()
  from public.saves s
  where s.id = sh.save_id and sh.group_id = gid and s.link_id = any (lids)
    and sh.removed_at is null and sh.picked_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Export since last time, and the Shortcut's note prompt
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column last_export_at timestamptz,
  add column shortcut_ask_note boolean not null default true;

-- Records an export of your archive (gid null) or of a group's links.
create function public.mark_exported (gid uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if gid is null then
    update public.profiles set last_export_at = now() where id = auth.uid ();
  else
    update public.memberships set last_export_at = now()
    where group_id = gid and user_id = auth.uid ();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. group_pool gains nicknames and the picked flag
-- ---------------------------------------------------------------------------

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
  -- Nicknames of sharers who set one for this group; the rest stay anonymous.
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
