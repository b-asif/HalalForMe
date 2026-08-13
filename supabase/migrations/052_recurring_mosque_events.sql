-- 052_recurring_mosque_events.sql
-- Recurring, prayer-anchored mosque events (e.g. "Halaqa every Monday, after
-- Isha"). Replaces mosque admins manually WhatsApp-broadcasting a reminder
-- every week: an admin configures the recurrence + anchor prayer once, and a
-- daily job materializes each week's real occurrence into mosque_posts (using
-- that mosque's current iqama_times) and auto-schedules a 1-hour-before push
-- reminder for every follower — reusing send_event_reminder_notifications()
-- (040) for delivery unchanged.
--
-- No per-mosque timezone: every mosque onboarded so far is in the same
-- region, so the daily check below is hardcoded to 'America/Los_Angeles' (a
-- named IANA zone, so PST/PDT DST transitions are handled automatically)
-- rather than adding per-mosque timezone configuration for admins to set up.

CREATE TABLE IF NOT EXISTS public.recurring_mosque_events (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mosque_id              uuid        NOT NULL REFERENCES public.mosques(id) ON DELETE CASCADE,
  title                  text        NOT NULL,
  body                   text,
  category               text,
  -- 0=Sunday..6=Saturday, matches Postgres EXTRACT(DOW).
  day_of_week            integer     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  anchor_prayer          text        NOT NULL CHECK (anchor_prayer IN ('fajr','dhuhr','asr','maghrib','isha')),
  anchor_offset_minutes  integer     NOT NULL DEFAULT 0,
  active                 boolean     NOT NULL DEFAULT true,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_mosque_events_mosque_id_idx
  ON public.recurring_mosque_events (mosque_id);

-- Reuses the set_updated_at() trigger function first defined in 008_verified_products.sql.
CREATE TRIGGER recurring_mosque_events_updated_at
  BEFORE UPDATE ON public.recurring_mosque_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.recurring_mosque_events ENABLE ROW LEVEL SECURITY;

-- Internal config, not user-facing — deliberately no public SELECT policy
-- (unlike mosque_posts, which the public "Upcoming Events" card reads).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recurring_mosque_events'
      AND policyname = 'Mosque owner or admin manages recurring events'
  ) THEN
    CREATE POLICY "Mosque owner or admin manages recurring events"
      ON public.recurring_mosque_events FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.mosques m
          WHERE m.id = mosque_id
            AND (m.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.mosques m
          WHERE m.id = mosque_id
            AND (m.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
        )
      );
  END IF;
END $$;

-- ── Time parsing ─────────────────────────────────────────────────────────────
-- Mirrors parseTimeOfDay() in lib/mosques/manual.ts:63-75 exactly — iqama_times
-- values are free-text strings like "9:45 PM" or "13:00".
CREATE OR REPLACE FUNCTION public.parse_time_of_day(t text)
RETURNS time
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m   text[];
  h   integer;
  mnt integer;
  mer text;
BEGIN
  IF t IS NULL THEN
    RETURN NULL;
  END IF;

  m := regexp_match(trim(t), '^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$');
  IF m IS NULL THEN
    RETURN NULL;
  END IF;

  h   := m[1]::integer;
  mnt := m[2]::integer;
  mer := upper(m[3]);

  IF mer = 'PM' AND h <> 12 THEN h := h + 12; END IF;
  IF mer = 'AM' AND h = 12 THEN h := 0; END IF;

  IF h > 23 OR mnt > 59 THEN
    RETURN NULL;
  END IF;

  RETURN make_time(h, mnt, 0);
END;
$$;

-- ── Materialization + auto-reminder job ─────────────────────────────────────
-- Called hourly by pg_cron below, but only does real work once a day (the
-- HOUR = 9 gate) — scheduling hourly rather than pinning one exact cron time
-- to "9 AM Pacific" sidesteps pg_cron's lack of built-in DST-aware
-- scheduling, at the cost of a cheap early-return most hours.
CREATE OR REPLACE FUNCTION public.materialize_recurring_mosque_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_la_now       timestamp := now() AT TIME ZONE 'America/Los_Angeles';
  v_recur        record;
  v_time         time;
  v_event_start  timestamptz;
  v_post_id      uuid;
  v_follower     record;
  v_materialized integer := 0;
BEGIN
  IF EXTRACT(HOUR FROM v_la_now) <> 9 THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  FOR v_recur IN
    SELECT re.*, m.iqama_times
    FROM public.recurring_mosque_events re
    JOIN public.mosques m ON m.id = re.mosque_id
    WHERE re.active = true
      AND re.day_of_week = EXTRACT(DOW FROM v_la_now)
  LOOP
    v_time := public.parse_time_of_day(v_recur.iqama_times ->> v_recur.anchor_prayer);
    IF v_time IS NULL THEN
      CONTINUE; -- iqama time not set/unparseable — retried automatically tomorrow
    END IF;

    -- Naive local midnight + parsed time-of-day, then reinterpreted as an
    -- LA-local wall-clock moment (AT TIME ZONE on a `timestamp` converts to
    -- `timestamptz`) — correctly DST-aware without per-mosque config.
    v_event_start := ((date_trunc('day', v_la_now) + v_time) AT TIME ZONE 'America/Los_Angeles')
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

-- Only service role (pg_cron) should call this directly.
REVOKE ALL ON FUNCTION public.materialize_recurring_mosque_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_recurring_mosque_events() TO service_role;

-- ── pg_cron: hourly ──────────────────────────────────────────────────────────
SELECT cron.unschedule('materialize-recurring-mosque-events')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'materialize-recurring-mosque-events');

SELECT cron.schedule(
  'materialize-recurring-mosque-events',
  '0 * * * *',
  $$ SELECT public.materialize_recurring_mosque_events(); $$
);
