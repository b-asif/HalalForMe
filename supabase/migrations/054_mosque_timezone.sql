-- 054_mosque_timezone.sql
-- Adds a per-mosque timezone column so that recurring event materialization
-- fires at the correct local time for mosques outside US Pacific time.
-- Replaces the hardcoded 'America/Los_Angeles' in materialize_recurring_mosque_events()
-- (052_recurring_mosque_events.sql) with a per-row lookup.

ALTER TABLE public.mosques
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles';

-- ── Updated materialization function ────────────────────────────────────────
-- Replaces the version from 052. Key changes:
--   1. The "is it 9 AM?" check now uses each mosque's own timezone, so the
--      guard fires once per mosque per day at 9 AM *local* time rather than
--      9 AM Pacific for every mosque worldwide.
--   2. v_event_start is computed using each mosque's timezone, not the
--      hardcoded 'America/Los_Angeles'.
--
-- Trade-off: because the cron job fires hourly on UTC time, a mosque in
-- America/New_York (UTC-4 in summer) will have its 9 AM local hour fall at
-- 13:00 UTC — the hourly cron catches it then. DST transitions are handled
-- automatically because we use named IANA zones throughout.
CREATE OR REPLACE FUNCTION public.materialize_recurring_mosque_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mosque_tz    text;
  v_local_now    timestamp;
  v_recur        record;
  v_time         time;
  v_event_start  timestamptz;
  v_post_id      uuid;
  v_follower     record;
  v_materialized integer := 0;
BEGIN
  -- Loop over each active recurring event, using the mosque's own timezone.
  FOR v_recur IN
    SELECT re.*, m.iqama_times, m.timezone AS mosque_tz
    FROM public.recurring_mosque_events re
    JOIN public.mosques m ON m.id = re.mosque_id
    WHERE re.active = true
  LOOP
    v_mosque_tz := COALESCE(v_recur.mosque_tz, 'America/Los_Angeles');
    v_local_now := now() AT TIME ZONE v_mosque_tz;

    -- Only materialize during the 9 AM hour in the mosque's local timezone,
    -- and only on the correct day of the week.
    IF EXTRACT(HOUR FROM v_local_now) <> 9 THEN
      CONTINUE;
    END IF;
    IF EXTRACT(DOW FROM v_local_now) <> v_recur.day_of_week THEN
      CONTINUE;
    END IF;

    v_time := public.parse_time_of_day(v_recur.iqama_times ->> v_recur.anchor_prayer);
    IF v_time IS NULL THEN
      CONTINUE; -- iqama time not set/unparseable — retried automatically tomorrow
    END IF;

    -- Naive local midnight + parsed time-of-day, then reinterpreted as a
    -- local wall-clock moment (AT TIME ZONE on a `timestamp` converts to
    -- `timestamptz`) — correctly DST-aware without per-event config.
    v_event_start := ((date_trunc('day', v_local_now) + v_time) AT TIME ZONE v_mosque_tz)
                      + make_interval(mins => v_recur.anchor_offset_minutes);

    v_post_id := NULL;
    INSERT INTO public.mosque_posts (
      mosque_id, type, title, body, category, categories, event_start, created_by
    ) VALUES (
      v_recur.mosque_id, 'event', v_recur.title, v_recur.body, v_recur.category,
      CASE WHEN v_recur.category IS NOT NULL THEN ARRAY[v_recur.category] ELSE ARRAY[]::text[] END,
      v_event_start, NULL
    )
    ON CONFLICT (mosque_id, title, event_start) DO NOTHING
    RETURNING id INTO v_post_id;

    IF v_post_id IS NULL THEN
      -- Already materialized (e.g. a manual re-run) — look up the existing row.
      SELECT id INTO v_post_id FROM public.mosque_posts
      WHERE mosque_id = v_recur.mosque_id AND title = v_recur.title AND event_start = v_event_start;
    END IF;

    IF v_post_id IS NOT NULL THEN
      v_materialized := v_materialized + 1;
      FOR v_follower IN
        SELECT user_id FROM public.mosque_follows WHERE mosque_id = v_recur.mosque_id
      LOOP
        INSERT INTO public.event_reminders (user_id, post_id, remind_at, lead_minutes, sent)
        VALUES (v_follower.user_id, v_post_id, v_event_start - interval '60 minutes', 60, false)
        ON CONFLICT (user_id, post_id, lead_minutes) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('materialized', v_materialized);
END;
$$;

-- Permissions unchanged from 052.
REVOKE ALL ON FUNCTION public.materialize_recurring_mosque_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_recurring_mosque_events() TO service_role;
