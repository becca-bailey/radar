-- Simplify capture (2026-11-09): a save is a link plus one short note about
-- why you saved it — private in the archive, shown to a group only when the
-- save is shared. The old long private-note field is dropped, and the field
-- formerly called "sentence" is renamed to "note" everywhere it was copied
-- (saves, recommendations, edition snapshots). search_archive returned both
-- old columns, so it is recreated (return type changes need drop + create).

drop function public.search_archive (text, vector, int);

alter table public.saves
drop column note;

alter table public.saves
rename column sentence to note;

alter table public.recommendations
rename column sentence to note;

alter table public.edition_links
rename column sentences to notes;

create function public.search_archive (
  query text,
  query_embedding vector (1536) default null,
  match_limit int default 30
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
sem as (
  select save_id, 1 - (embedding <=> query_embedding) as sim
  from mine
  where query_embedding is not null and embedding is not null
  order by embedding <=> query_embedding
  limit match_limit
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
