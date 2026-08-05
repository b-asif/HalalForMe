-- ================================================================
-- Migration 016: zabihah_status and zabihah_notes on restaurants
--
-- Adds two columns to track whether a restaurant serves zabihah
-- halal (hand-slaughtered meat per strict Islamic requirements).
-- This is orthogonal to third-party certification: a restaurant
-- can be HMA-certified AND fully zabihah, or purely self-reported.
--
-- zabihah_status: 'full' = all meat is zabihah
--                'partial' = some meats only (see zabihah_notes)
--                NULL = not zabihah / unknown
-- zabihah_notes: optional free-text, e.g. "Beef & lamb only —
--                chicken is halal but not zabihah"
--
-- restaurants is an untracked table (no CREATE TABLE in migrations/).
-- All statements use ADD COLUMN IF NOT EXISTS for idempotency,
-- consistent with the project's established pattern (see 015).
-- ================================================================

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS zabihah_status text
    CONSTRAINT restaurants_zabihah_status_check CHECK (zabihah_status IN ('full', 'partial'));

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS zabihah_notes text;

