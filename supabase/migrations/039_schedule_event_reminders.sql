-- 039_schedule_event_reminders.sql
-- Schedules the send-event-reminders edge function via pg_cron + pg_net.
--
-- Prerequisites (Supabase dashboard → Database → Extensions):
--   1. pg_cron must be enabled
--   2. pg_net  must be enabled
--
-- The SUPABASE_URL and CRON_SECRET must be stored as database-level settings
-- so the cron job can read them at runtime:
--
--   Run these once in the SQL editor (replace with your actual values):
--     ALTER DATABASE postgres SET app.supabase_url   = 'https://YOUR_PROJECT_REF.supabase.co';
--     ALTER DATABASE postgres SET app.cron_secret    = 'YOUR_CRON_SECRET';
--
--   CRON_SECRET must match the CRON_SECRET set in Supabase Edge Function secrets
--   (Dashboard → Edge Functions → send-event-reminders → Secrets).
--
-- If pg_cron is not available on your plan, schedule the function from the
-- Supabase dashboard instead:
--   Dashboard → Integrations → Cron → New cron job
--   URL:    https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-event-reminders
--   Method: POST
--   Header: Authorization: Bearer YOUR_CRON_SECRET
--   Schedule: */5 * * * *  (every 5 minutes)

-- Remove any existing job with this name before re-creating (idempotent).
SELECT cron.unschedule('send-event-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-event-reminders');

-- Fire every 5 minutes.
-- The edge function uses a 10-minute lookback window so occasional late
-- fires or double-fires within the same window are safe (reminders are
-- only marked sent once, and the lower bound prevents re-delivery).
SELECT cron.schedule(
  'send-event-reminders',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/send-event-reminders',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || current_setting('app.cron_secret')
                 ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $$
);
