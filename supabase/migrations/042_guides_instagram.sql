-- Migration 042: Add instagram_handle to guides
-- Stores the username only (no @ prefix, no full URL).
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op on re-run.

ALTER TABLE public.guides
  ADD COLUMN IF NOT EXISTS instagram_handle text;
