-- Community suggestions: students can nominate existing restaurants or submit new ones
-- for a guide. Admins review and approve/reject from the guide edit screen.

CREATE TABLE public.guide_suggestions (
  id              uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id        uuid        NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Existing restaurant nomination (NULL means new-place suggestion)
  restaurant_id   uuid        REFERENCES public.restaurants(id) ON DELETE CASCADE,
  -- Fields used when restaurant_id IS NULL (new place)
  name            text,
  address         text,
  -- Common fields
  note            text,
  status          text        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewer_notes  text,
  created_at      timestamptz          DEFAULT now()
);

-- Prevent a user from nominating the same restaurant to the same guide twice
CREATE UNIQUE INDEX guide_suggestions_dedup
  ON public.guide_suggestions(guide_id, user_id, restaurant_id)
  WHERE restaurant_id IS NOT NULL;

-- Index for admin queries (pending by guide)
CREATE INDEX guide_suggestions_guide_status
  ON public.guide_suggestions(guide_id, status);

ALTER TABLE public.guide_suggestions ENABLE ROW LEVEL SECURITY;

-- Users can insert their own suggestions
CREATE POLICY "Users can insert own guide suggestions"
  ON public.guide_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own suggestions
CREATE POLICY "Users can read own guide suggestions"
  ON public.guide_suggestions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all suggestions
CREATE POLICY "Admins can read all guide suggestions"
  ON public.guide_suggestions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Admins can approve or reject suggestions
CREATE POLICY "Admins can update guide suggestions"
  ON public.guide_suggestions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Add guide context to the existing restaurant submission flow so that
-- when a student submits a brand-new restaurant for a specific guide,
-- the admin can honour that intent when approving the submission.
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS suggested_guide_id uuid REFERENCES public.guides(id) ON DELETE SET NULL;
