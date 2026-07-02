-- ============================================================
-- Migration: community-uploaded menu photos
-- Run this in the Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  url           text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_photos_restaurant_id_idx ON menu_photos(restaurant_id);

-- RLS
ALTER TABLE menu_photos ENABLE ROW LEVEL SECURITY;

-- Anyone can view menu photos
CREATE POLICY "menu_photos_select" ON menu_photos
  FOR SELECT USING (true);

-- Authenticated users can insert their own photos
CREATE POLICY "menu_photos_insert" ON menu_photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own photos
CREATE POLICY "menu_photos_delete" ON menu_photos
  FOR DELETE USING (auth.uid() = user_id);
