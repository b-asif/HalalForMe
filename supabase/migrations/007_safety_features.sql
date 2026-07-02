-- ================================================================
-- Migration 007: Apple Guideline 1.2 safety features
-- Run in Supabase SQL editor
-- ================================================================

-- 1. Track ToS/EULA acceptance timestamp on user profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz;

-- 2. Reports table — users flag review/restaurant content
CREATE TABLE IF NOT EXISTS public.reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type text        NOT NULL CHECK (content_type IN ('review', 'restaurant')),
  content_id   uuid        NOT NULL,
  reason       text        NOT NULL CHECK (reason IN ('spam', 'inappropriate', 'harassment', 'other')),
  comment      text,
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_reporter_idx     ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS reports_content_idx      ON public.reports (content_type, content_id);
CREATE INDEX IF NOT EXISTS reports_status_idx       ON public.reports (status);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Users can create reports
CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Users can view their own reports
CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- Admins can view and update all reports
CREATE POLICY "Admins can view all reports"
  ON public.reports FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));

CREATE POLICY "Admins can update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- 3. Blocks table — users hide content from specific other users
CREATE TABLE IF NOT EXISTS public.blocks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON public.blocks (blocker_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON public.blocks (blocked_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Users can fully manage their own blocks
CREATE POLICY "Users can manage own blocks"
  ON public.blocks FOR ALL TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());
