-- RAD-63: every member has a name in each group they're in.
--
-- Names used to be optional (null meant anonymous). Now joining or creating a
-- group asks for one, it shows on every share in that group, and it can be
-- changed but not cleared. profiles.display_name becomes the member's default
-- name: it pre-fills the name field when they join or create a group, and
-- only they can read it.
--
-- Fails if any membership still has no name. Set it from the group's menu
-- first.

alter table public.memberships
  alter column display_name set not null;

-- Renaming yourself in a group: same rules, and a blank name is refused
-- instead of meaning "anonymous".
create or replace function public.set_group_display_name (gid uuid, name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean text := btrim(left(btrim(coalesce(name, '')), 40));
begin
  if clean = '' then
    raise exception 'A name is required' using errcode = '22023';
  end if;
  update public.memberships
  set display_name = clean
  where group_id = gid and user_id = auth.uid ();
end;
$$;

-- Creating a group makes the owner's membership in the same step, with their
-- name. Replaces the on_group_created trigger, which couldn't know the name,
-- and direct inserts into groups.
drop trigger on_group_created on public.groups;
drop function public.handle_new_group ();
drop policy "groups: create own" on public.groups;

create function public.create_group (group_name text, member_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid ();
  gname text := btrim(left(btrim(coalesce(group_name, '')), 100));
  mname text := btrim(left(btrim(coalesce(member_name, '')), 40));
  gid uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if gname = '' then
    raise exception 'A group name is required' using errcode = '22023';
  end if;
  if mname = '' then
    raise exception 'A name is required' using errcode = '22023';
  end if;

  insert into public.groups (name, owner_id)
  values (gname, uid)
  returning id into gid;

  insert into public.memberships (group_id, user_id, role, display_name)
  values (gid, uid, 'owner', mname);

  return gid;
end;
$$;

revoke execute on function public.create_group (text, text) from public, anon;
grant execute on function public.create_group (text, text) to authenticated;
