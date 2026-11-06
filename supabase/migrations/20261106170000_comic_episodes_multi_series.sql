-- A post can belong to several series on the site (e.g. "Civil War X-Man" is in both
-- Civil War and X-Man), so uniqueness is per series, not per URL.
alter table public.comic_episodes drop constraint if exists comic_episodes_url_key;
alter table public.comic_episodes add constraint comic_episodes_series_url_key unique (series_id, url);
create index if not exists comic_episodes_url_idx on public.comic_episodes (url);
