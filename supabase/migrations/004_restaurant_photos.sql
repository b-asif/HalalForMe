-- ============================================================
-- Migration: community-categorized restaurant photos
-- Run this in the Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  review_id     uuid REFERENCES reviews(id) ON DELETE SET NULL,
  url           text NOT NULL,
  category      text NOT NULL CHECK (category IN ('food', 'outside', 'inside')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurant_photos_restaurant_id_idx ON restaurant_photos(restaurant_id);

ALTER TABLE restaurant_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_photos_select" ON restaurant_photos
  FOR SELECT USING (true);

CREATE POLICY "restaurant_photos_insert" ON restaurant_photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "restaurant_photos_delete" ON restaurant_photos
  FOR DELETE USING (auth.uid() = user_id);
