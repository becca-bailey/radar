-- Ingest discovers the true canonical URL from the fetched page; when it
-- differs and a Link already exists at that URL, the worker merges the stub
-- into the existing row. Saves repoint; a user who saved both keeps one.

create function public.merge_links (old_id uuid, new_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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
