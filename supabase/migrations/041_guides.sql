-- ================================================================
-- Migration 041: Guides — admin-curated collections of places
--
-- Three tables:
--   guides        — public read (published), admin write
--   guide_items   — public read (via published guide), admin write
--   saved_guides  — owner-only (user bookmarks)
--
-- All statements are idempotent (DROP POLICY IF EXISTS + CREATE POLICY,
-- CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
--
-- RLS admin check mirrors the existing pattern in 029_rls_core_tables.sql:
--   EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
-- ================================================================

-- ----------------------------------------------------------------
-- guides
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guides (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  subtitle        text,
  cover_image_url text,
  category        text        NOT NULL CHECK (category IN ('campus', 'cafe', 'food')),
  tags            text[]      NOT NULL DEFAULT '{}',
  is_featured     boolean     NOT NULL DEFAULT false,
  is_published    boolean     NOT NULL DEFAULT true,
  position        int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- guide_items
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guide_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id      uuid        NOT NULL REFERENCES public.guides(id)       ON DELETE CASCADE,
  restaurant_id uuid        NOT NULL REFERENCES public.restaurants(id)  ON DELETE CASCADE,
  position      int         NOT NULL DEFAULT 0,
  curator_note  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (guide_id, restaurant_id)
);

-- ----------------------------------------------------------------
-- saved_guides  (user bookmarks)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_guides (
  user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guide_id uuid        NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, guide_id)
);

-- ----------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_guide_items_guide_position
  ON public.guide_items (guide_id, position);

CREATE INDEX IF NOT EXISTS idx_saved_guides_user_id
  ON public.saved_guides (user_id);

-- ----------------------------------------------------------------
-- RLS — guides
-- ----------------------------------------------------------------
ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guides_public_read"  ON public.guides;
CREATE POLICY "guides_public_read"
  ON public.guides FOR SELECT
  TO public
  USING (is_published = true);

DROP POLICY IF EXISTS "guides_admin_all"    ON public.guides;
CREATE POLICY "guides_admin_all"
  ON public.guides FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- ----------------------------------------------------------------
-- RLS — guide_items
-- ----------------------------------------------------------------
ALTER TABLE public.guide_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guide_items_public_read" ON public.guide_items;
CREATE POLICY "guide_items_public_read"
  ON public.guide_items FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.guides g
      WHERE g.id = guide_id AND g.is_published = true
    )
  );

DROP POLICY IF EXISTS "guide_items_admin_all"   ON public.guide_items;
CREATE POLICY "guide_items_admin_all"
  ON public.guide_items FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- ----------------------------------------------------------------
-- RLS — saved_guides
-- ----------------------------------------------------------------
ALTER TABLE public.saved_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_guides_owner_read"   ON public.saved_guides;
CREATE POLICY "saved_guides_owner_read"
  ON public.saved_guides FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_guides_owner_insert" ON public.saved_guides;
CREATE POLICY "saved_guides_owner_insert"
  ON public.saved_guides FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "saved_guides_owner_delete" ON public.saved_guides;
CREATE POLICY "saved_guides_owner_delete"
  ON public.saved_guides FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- Seed: Muslim Student Guide: SJSU
-- Restaurants are populated via the admin "Manage Guides" UI —
-- add verified restaurant IDs there after running this migration.
-- ----------------------------------------------------------------
INSERT INTO public.guides (title, subtitle, cover_image_url, category, tags, is_featured, is_published, position)
SELECT
  'Muslim Student Guide: SJSU',
  'Prayer spaces, halal food, study spots & community all in one place.',
  null,
  'campus',
  ARRAY['Halal Food', 'Study Spots', 'Prayer'],
  true,
  true,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM public.guides WHERE title = 'Muslim Student Guide: SJSU'
);
