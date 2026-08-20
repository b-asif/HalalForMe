-- ─────────────────────────────────────────────────────────────────────────────
-- 071_campus_dining.sql
--
-- Adds daily halal dining updates to the Campus Hub.
-- MSA admins post what's halal at each dining hall each day.
-- Students can subscribe to "dining" push notifications.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.campus_dining_updates (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  msa_id           uuid        NOT NULL REFERENCES public.msas(id) ON DELETE CASCADE,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  dining_hall      text        NOT NULL,          -- e.g. "North Dining Hall"
  date             date        NOT NULL DEFAULT CURRENT_DATE,
  items            text        NOT NULL,          -- free-text list of halal items for the day
  notes            text,                          -- optional extra info (hours, station, etc.)
  is_published     boolean     NOT NULL DEFAULT false,
  notify_followers boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campus_dining_updates_msa_date_idx
  ON public.campus_dining_updates (msa_id, date DESC);

-- Auto-update updated_at
CREATE TRIGGER campus_dining_updates_updated_at
  BEFORE UPDATE ON public.campus_dining_updates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.campus_dining_updates ENABLE ROW LEVEL SECURITY;

-- Anyone can read published updates
CREATE POLICY "campus_dining_updates_public_read"
  ON public.campus_dining_updates FOR SELECT
  USING (is_published = true);

-- Active MSA members can read all (including drafts)
CREATE POLICY "campus_dining_updates_member_read"
  ON public.campus_dining_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.msa_members mm
      WHERE mm.msa_id = campus_dining_updates.msa_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'active'
    )
  );

-- Active MSA members can insert
CREATE POLICY "campus_dining_updates_member_insert"
  ON public.campus_dining_updates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.msa_members mm
      WHERE mm.msa_id = campus_dining_updates.msa_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'active'
    )
  );

-- Active MSA members can update
CREATE POLICY "campus_dining_updates_member_update"
  ON public.campus_dining_updates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.msa_members mm
      WHERE mm.msa_id = campus_dining_updates.msa_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'active'
    )
  );

-- Active MSA members can delete
CREATE POLICY "campus_dining_updates_member_delete"
  ON public.campus_dining_updates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.msa_members mm
      WHERE mm.msa_id = campus_dining_updates.msa_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'active'
    )
  );

-- Global admins can do anything
CREATE POLICY "campus_dining_updates_admin_all"
  ON public.campus_dining_updates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- ── Notification category ─────────────────────────────────────────────────────
-- Add 'dining' to the campus_notification_preferences category check constraint.

ALTER TABLE public.campus_notification_preferences
  DROP CONSTRAINT IF EXISTS campus_notification_preferences_category_check;

ALTER TABLE public.campus_notification_preferences
  ADD CONSTRAINT campus_notification_preferences_category_check
  CHECK (category IN ('jummah', 'prayer', 'events', 'announcements', 'dining'));
