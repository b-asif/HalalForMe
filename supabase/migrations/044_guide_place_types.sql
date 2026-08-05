-- ================================================================
-- Migration 044: Expand guide_items to support mosques and
--               campus prayer rooms alongside restaurants.
--
-- Changes:
--   1. New table: prayer_rooms (campus-specific, no standalone page)
--   2. guide_items.restaurant_id → nullable
--   3. guide_items.mosque_id     → new nullable FK → mosques
--   4. guide_items.prayer_room_id → new nullable FK → prayer_rooms
--   5. CHECK constraint: exactly one FK is non-null
--   6. Old UNIQUE(guide_id, restaurant_id) replaced by three partial
--      unique indexes (one per item type)
--
-- All statements are idempotent.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. prayer_rooms
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prayer_rooms (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  building_name  text        NOT NULL,
  room_number    text,
  wudu_available boolean     NOT NULL DEFAULT false,
  hours          text,
  lat            double precision,
  lng            double precision,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prayer_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prayer_rooms_public_read" ON public.prayer_rooms;
CREATE POLICY "prayer_rooms_public_read"
  ON public.prayer_rooms FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "prayer_rooms_admin_all" ON public.prayer_rooms;
CREATE POLICY "prayer_rooms_admin_all"
  ON public.prayer_rooms FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- Reuse the existing set_updated_at() trigger function (created in an earlier migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prayer_rooms_updated_at'
      AND tgrelid = 'public.prayer_rooms'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER prayer_rooms_updated_at
      BEFORE UPDATE ON public.prayer_rooms
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. Extend guide_items
-- ----------------------------------------------------------------

-- Make restaurant_id nullable (idempotent — DROP NOT NULL is a no-op
-- when the column is already nullable)
ALTER TABLE public.guide_items
  ALTER COLUMN restaurant_id DROP NOT NULL;

-- Add mosque_id FK (idempotent via IF NOT EXISTS)
ALTER TABLE public.guide_items
  ADD COLUMN IF NOT EXISTS mosque_id uuid
    REFERENCES public.mosques(id) ON DELETE CASCADE;

-- Add prayer_room_id FK (idempotent via IF NOT EXISTS)
ALTER TABLE public.guide_items
  ADD COLUMN IF NOT EXISTS prayer_room_id uuid
    REFERENCES public.prayer_rooms(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- 3. Exactly-one-type CHECK constraint (idempotent)
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guide_items_one_place_type'
      AND conrelid = 'public.guide_items'::regclass
  ) THEN
    ALTER TABLE public.guide_items
      ADD CONSTRAINT guide_items_one_place_type
      CHECK (
        (restaurant_id  IS NOT NULL)::int +
        (mosque_id      IS NOT NULL)::int +
        (prayer_room_id IS NOT NULL)::int = 1
      );
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. Replace old UNIQUE(guide_id, restaurant_id) with partial indexes
-- ----------------------------------------------------------------
ALTER TABLE public.guide_items
  DROP CONSTRAINT IF EXISTS guide_items_guide_id_restaurant_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guide_items_unique_restaurant
  ON public.guide_items (guide_id, restaurant_id)
  WHERE restaurant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guide_items_unique_mosque
  ON public.guide_items (guide_id, mosque_id)
  WHERE mosque_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guide_items_unique_prayer_room
  ON public.guide_items (guide_id, prayer_room_id)
  WHERE prayer_room_id IS NOT NULL;

-- FK lookup indexes
CREATE INDEX IF NOT EXISTS idx_guide_items_mosque_id
  ON public.guide_items (mosque_id)
  WHERE mosque_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guide_items_prayer_room_id
  ON public.guide_items (prayer_room_id)
  WHERE prayer_room_id IS NOT NULL;

-- RLS: existing guide_items_public_read and guide_items_admin_all
-- policies are unchanged — they cover all rows regardless of FK type.
