-- RAD-57: the group menu shows owners "Removed links (n)". The group page used
-- to fetch the whole list from group_removed_links just to read its length.
--
-- A count query on shares can't do it: owners can only read their own share
-- rows (RLS), and shares reach links through saves. Like group_removed_links,
-- this is security definer with an explicit owner check, and it counts the
-- same rows: distinct links with a removed share in the group.
create function public.group_removed_link_count (gid uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct s.link_id)
  from public.shares sh
  join public.saves s on s.id = sh.save_id
  where sh.group_id = gid
    and sh.removed_at is not null
    and public.is_group_owner (gid, auth.uid ());
$$;

revoke execute on function public.group_removed_link_count (uuid) from public, anon;
grant execute on function public.group_removed_link_count (uuid) to authenticated;
