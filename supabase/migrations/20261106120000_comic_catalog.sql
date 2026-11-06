-- Panel comics catalog (crawled from cizgiarsiv.com). Read-only for app users;
-- written only by the comics-crawl function with the service role.
create table if not exists public.comic_series (
  id bigint generated always as identity primary key,
  slug text not null unique,
  title text not null,
  url text not null unique,
  cover_url text,
  group_name text,
  description text,
  episode_count integer not null default 0,
  source_updated_at timestamptz,
  crawled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.comic_episodes (
  id bigint generated always as identity primary key,
  series_id bigint not null references public.comic_series(id) on delete cascade,
  url text not null unique,
  title text not null,
  number numeric,
  position integer not null default 0,
  drive_id text,
  cover_url text,
  published_at timestamptz,
  crawled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists comic_episodes_series_position_idx on public.comic_episodes (series_id, position);

alter table public.comic_series enable row level security;
alter table public.comic_episodes enable row level security;

create policy "comic_series readable by everyone" on public.comic_series for select to anon, authenticated using (true);
create policy "comic_episodes readable by everyone" on public.comic_episodes for select to anon, authenticated using (true);

grant select on public.comic_series, public.comic_episodes to anon, authenticated;
