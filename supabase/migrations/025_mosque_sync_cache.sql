-- 025_mosque_sync_cache.sql
-- Adds a server-side cache table for mosque website sync results.
-- Enables change detection (hash-based), LLM cost tracking, and admin review workflow.
-- Written idempotently throughout.

-- ── Cache table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mosque_sync_cache (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mosque_id           uuid        NOT NULL REFERENCES public.mosques(id) ON DELETE CASCADE,
  source_url          text        NOT NULL,
  -- SHA-256 hex of cleaned page text; used for change detection
  content_hash        text        NOT NULL,
  -- Full SyncResult JSON returned by the parser
  extracted_data_json jsonb,
  -- Which tier produced the data: 'deterministic' | 'llm_fallback' | 'cached'
  extraction_method   text        NOT NULL DEFAULT 'deterministic',
  -- Overall confidence: 'high' | 'medium' | 'low'
  confidence          text,
  -- True when confidence is low or conflicting times were found; requires admin review before publishing
  needs_review        boolean     NOT NULL DEFAULT false,
  -- Admin review state: 'pending' | 'approved' | 'rejected'
  review_status       text        NOT NULL DEFAULT 'pending',
  reviewed_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  -- Array of warning strings (e.g. "conflicting Fajr times from two sources")
  warnings            jsonb,
  -- LLM cost tracking (null when extraction_method = 'deterministic' or 'cached')
  estimated_llm_cost  numeric(12, 8),
  input_tokens        integer,
  output_tokens       integer,
  model_used          text,
  -- Timestamps
  last_checked_at     timestamptz NOT NULL DEFAULT now(),
  last_changed_at     timestamptz,           -- set when content_hash changes
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One row per mosque (upserted on each sync)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mosque_sync_cache_mosque_id_key'
      AND conrelid = 'public.mosque_sync_cache'::regclass
  ) THEN
    ALTER TABLE public.mosque_sync_cache ADD CONSTRAINT mosque_sync_cache_mosque_id_key UNIQUE (mosque_id);
  END IF;
END$$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS mosque_sync_cache_needs_review_idx
  ON public.mosque_sync_cache (needs_review)
  WHERE needs_review = true;

CREATE INDEX IF NOT EXISTS mosque_sync_cache_review_status_idx
  ON public.mosque_sync_cache (review_status);

CREATE INDEX IF NOT EXISTS mosque_sync_cache_last_checked_idx
  ON public.mosque_sync_cache (last_checked_at DESC);

-- ── Row-level security ────────────────────────────────────────────────────────
ALTER TABLE public.mosque_sync_cache ENABLE ROW LEVEL SECURITY;

-- Admins: full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mosque_sync_cache' AND policyname = 'admin_full_mosque_sync_cache'
  ) THEN
    CREATE POLICY admin_full_mosque_sync_cache ON public.mosque_sync_cache
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND is_admin = true
        )
      );
  END IF;
END$$;

-- Mosque owners: read their own cache row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mosque_sync_cache' AND policyname = 'owner_read_mosque_sync_cache'
  ) THEN
    CREATE POLICY owner_read_mosque_sync_cache ON public.mosque_sync_cache
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.mosques
          WHERE id = mosque_id AND owner_id = auth.uid()
        )
      );
  END IF;
END$$;

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_mosque_sync_cache_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mosque_sync_cache_updated_at ON public.mosque_sync_cache;
CREATE TRIGGER mosque_sync_cache_updated_at
  BEFORE UPDATE ON public.mosque_sync_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_mosque_sync_cache_updated_at();

-- ── pg_cron weekly schedule ───────────────────────────────────────────────────
-- Requires pg_cron and pg_net extensions. Both are available on Supabase Pro/Team.
-- If running on Free tier, comment out the cron block and trigger syncs manually.
--
-- The schedule calls the mosque-website-batch-sync edge function every Sunday at 3 AM UTC.
-- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as database secrets:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
-- (Or set them in the Supabase dashboard under Project Settings → Database → Connection pooling)
--
-- Uncomment the block below once extensions are confirmed enabled:
--
-- SELECT cron.unschedule('mosque-website-weekly-sync') WHERE EXISTS (
--   SELECT 1 FROM cron.job WHERE jobname = 'mosque-website-weekly-sync'
-- );
-- SELECT cron.schedule(
--   'mosque-website-weekly-sync',
--   '0 3 * * 0',
--   $$
--     SELECT net.http_post(
--       url        := current_setting('app.supabase_url') || '/functions/v1/mosque-website-batch-sync',
--       headers    := jsonb_build_object(
--                       'Content-Type',  'application/json',
--                       'Authorization', 'Bearer ' || current_setting('app.service_role_key')
--                     ),
--       body       := '{}'::jsonb,
--       timeout_milliseconds := 55000
--     );
--   $$
-- );
