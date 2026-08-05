-- 020_event_category.sql
-- Adds a free-text category label to mosque_posts so event admins can tag
-- events (e.g. "lectures", "quran", "youth", "sisters") and the Events
-- screen can filter by them. Free-text rather than an enum so new categories
-- can be added from the app without a schema change.

ALTER TABLE public.mosque_posts
  ADD COLUMN IF NOT EXISTS category text;
