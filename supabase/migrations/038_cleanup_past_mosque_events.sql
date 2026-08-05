-- 038_cleanup_past_mosque_events.sql
-- Adds a function that deletes past mosque events and schedules it nightly via pg_cron.
--
-- Announcements (type = 'announcement') are never deleted — they have no date
-- and are meant to be persistent until the owner removes them manually.
--
-- Grace period: COALESCE(event_end, event_start) < now() - interval '1 day'
-- Multi-day events stay visible until their end date passes.
-- Same-day events stay visible until midnight of the following day.
-- event_reminders rows are cleaned up automatically via ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.cleanup_past_mosque_events()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM public.mosque_posts
    WHERE type = 'event'
      AND COALESCE(event_end, event_start) < now() - interval '1 day'
    RETURNING id
  )
  SELECT count(*)::integer FROM deleted;
$$;

-- Only service role (edge functions / pg_cron) should call this directly.
REVOKE ALL ON FUNCTION public.cleanup_past_mosque_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_past_mosque_events() TO service_role;

-- Run immediately to clean up any existing past events when this migration is applied.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT public.cleanup_past_mosque_events() INTO n;
  RAISE NOTICE 'cleanup_past_mosque_events: deleted % past event(s)', n;
END $$;

-- ── pg_cron nightly schedule ───────────────────────────────────────────────────
-- Requires the pg_cron extension (available on Supabase Pro / Team).
-- Runs every night at 2 AM UTC, independently of whether a batch sync ran.
--
-- To enable:
--   1. Go to Supabase Dashboard → Database → Extensions → enable pg_cron
--   2. Uncomment the block below and run this migration (or run the SELECT manually)
--
-- SELECT cron.unschedule('cleanup-past-mosque-events')
--   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-past-mosque-events');
-- SELECT cron.schedule(
--   'cleanup-past-mosque-events',
--   '0 2 * * *',
--   $$ SELECT public.cleanup_past_mosque_events(); $$
-- );
