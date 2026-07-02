-- ============================================================
-- Migration: gallery photos + admin support
-- Run this in the Supabase SQL editor or via the CLI
-- ============================================================

-- 1. submissions: add gallery photo URL arrays
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS food_photo_urls       text[],
  ADD COLUMN IF NOT EXISTS restaurant_photo_urls text[];

-- 2. restaurants: add gallery images column
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS gallery_images text[];

-- 3. profiles: add admin flag (default false for all existing users)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 4. Storage bucket for gallery photos
--    Run this in the Supabase Dashboard → Storage → New bucket:
--      Name: gallery_photos
--      Public: true
--
--    Or via SQL (requires pg_net / storage schema access):
--    INSERT INTO storage.buckets (id, name, public)
--    VALUES ('gallery_photos', 'gallery_photos', true)
--    ON CONFLICT (id) DO NOTHING;

-- 5. To grant yourself admin access, run:
--    UPDATE profiles SET is_admin = true WHERE id = '<your-user-uuid>';
