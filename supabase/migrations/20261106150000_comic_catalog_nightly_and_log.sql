-- Nightly at 00:07 UTC (03:07 Istanbul) instead of the morning.
select cron.alter_job((select jobid from cron.job where jobname = 'comics-crawl-daily'), schedule := '7 0 * * *');

-- One row per crawl: what changed. Only the crawler (service role) reads/writes it.
create table if not exists public.comic_crawl_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  series_total integer,
  episodes_total integer,
  new_series integer,
  new_episodes integer,
  new_episode_urls text[],
  error text
);
alter table public.comic_crawl_runs enable row level security;

-- "Yeni bölümler" feed in the app.
create index if not exists comic_episodes_published_idx on public.comic_episodes (published_at desc);
