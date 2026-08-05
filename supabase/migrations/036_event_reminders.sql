-- Event reminders: lets signed-in users schedule a push notification
-- before an upcoming mosque event (1 hour or 1 day in advance).
--
-- remind_at is precomputed at insert time so the cron job can do a
-- simple `WHERE remind_at <= now() AND NOT sent` query with no arithmetic.
--
-- Written idempotently in case the table was created out-of-band.

CREATE TABLE IF NOT EXISTS public.event_reminders (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id      uuid        NOT NULL REFERENCES public.mosque_posts(id) ON DELETE CASCADE,
  remind_at    timestamptz NOT NULL,
  lead_minutes integer     NOT NULL,   -- 60 (1 hour) or 1440 (1 day)
  sent         boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id, lead_minutes)
);

-- Partial index: cron job only ever queries unsent rows near remind_at
CREATE INDEX IF NOT EXISTS event_reminders_remind_at_sent_idx
  ON public.event_reminders (remind_at, sent)
  WHERE NOT sent;

ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

-- Users can only read and manage their own reminders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'event_reminders'
      AND policyname = 'Owner manages reminders'
  ) THEN
    CREATE POLICY "Owner manages reminders"
      ON public.event_reminders FOR ALL
      TO authenticated
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
