-- ============================================================
-- Migration: add per-category rating columns to reviews
-- Run this in the Supabase SQL editor
-- ============================================================

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS food_rating      integer CHECK (food_rating      BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS ambiance_rating  integer CHECK (ambiance_rating  BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS service_rating   integer CHECK (service_rating   BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS value_rating     integer CHECK (value_rating     BETWEEN 1 AND 5);
