create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Refresh the comics catalog every day at 04:17 UTC (07:17 Istanbul).
-- The bearer token is the project's public anon key (the function itself only writes
-- catalog rows and refuses to run more than once per 10 minutes).
select cron.schedule(
  'comics-crawl-daily',
  '17 4 * * *',
  $$
  select net.http_post(
    url := 'https://ufvacbllcwrwpirgcqcy.supabase.co/functions/v1/comics-crawl',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <anon key>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
