create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table public.catalogs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  keywords text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  file_path text not null,
  cover_path text,
  page_count int not null default 0,
  language text not null default 'ar',
  created_at timestamptz not null default now()
);
create table public.catalog_chunks (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  page int not null,
  content text not null,
  embedding extensions.vector(3072)
);
create index catalog_chunks_catalog_id_idx on public.catalog_chunks(catalog_id);
create index catalog_chunks_trgm on public.catalog_chunks using gin (lower(content) extensions.gin_trgm_ops);

create table public.catalog_profiles (
  catalog_id uuid primary key references public.catalogs(id) on delete cascade,
  summary_ar text not null default '',
  summary_en text not null default '',
  specs jsonb not null default '{}'::jsonb,
  embedding extensions.vector(3072),
  updated_at timestamptz not null default now()
);

-- Server-only access (server functions use the service role); no direct browser access.
grant all on public.categories, public.catalogs, public.catalog_chunks, public.catalog_profiles to service_role;
alter table public.categories enable row level security;
alter table public.catalogs enable row level security;
alter table public.catalog_chunks enable row level security;
alter table public.catalog_profiles enable row level security;

create or replace function public.search_catalogs(q text)
returns table(id uuid, score real)
language sql stable set search_path = public, extensions as $$
  with c as (
    select ca.id,
      greatest(
        word_similarity(lower(q), lower(ca.title || ' ' || ca.keywords || ' ' || ca.description)),
        coalesce((select max(word_similarity(lower(q), lower(ch.content))) from catalog_chunks ch where ch.catalog_id = ca.id), 0) * 0.8
      ) as score
    from catalogs ca
  )
  select id, score from c where score > 0.3 order by score desc limit 30;
$$;

create or replace function public.search_chunks(q text, lim int default 12)
returns table(catalog_id uuid, title text, page int, content text, score real)
language sql stable set search_path = public, extensions as $$
  select ch.catalog_id, ca.title, ch.page, ch.content,
    (word_similarity(lower(q), lower(ch.content)) + word_similarity(lower(q), lower(ca.title || ' ' || ca.keywords)))::real as score
  from catalog_chunks ch join catalogs ca on ca.id = ch.catalog_id
  order by score desc limit lim;
$$;

create or replace function public.match_chunks(query_embedding extensions.vector(3072), lim integer default 12)
returns table(catalog_id uuid, title text, page integer, content text, score real)
language sql stable set search_path = public, extensions as $$
  select ch.catalog_id, c.title, ch.page, ch.content, (1 - (ch.embedding <=> query_embedding))::real
  from public.catalog_chunks ch join public.catalogs c on c.id = ch.catalog_id
  where ch.embedding is not null
  order by ch.embedding <=> query_embedding limit lim;
$$;

create or replace function public.match_profiles(query_embedding extensions.vector(3072), lim integer default 8)
returns table(catalog_id uuid, title text, summary_en text, summary_ar text, specs jsonb, score real)
language sql stable set search_path = public, extensions as $$
  select p.catalog_id, c.title, p.summary_en, p.summary_ar, p.specs, (1 - (p.embedding <=> query_embedding))::real
  from public.catalog_profiles p join public.catalogs c on c.id = p.catalog_id
  where p.embedding is not null
  order by p.embedding <=> query_embedding limit lim;
$$;

revoke execute on function public.search_catalogs(text) from public, anon, authenticated;
revoke execute on function public.search_chunks(text, int) from public, anon, authenticated;
revoke execute on function public.match_chunks(extensions.vector, integer) from public, anon, authenticated;
revoke execute on function public.match_profiles(extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.search_catalogs(text), public.search_chunks(text, int),
  public.match_chunks(extensions.vector, integer), public.match_profiles(extensions.vector, integer) to service_role;