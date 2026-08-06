-- 049_mosque_posts_unique_event.sql
-- Adds a unique constraint on (mosque_id, title, event_start) so that
-- upsert-based batch syncs never create duplicate mosque_posts rows.
-- Uses a partial index (WHERE event_start IS NOT NULL) so that announcements
-- and recurring events without a date are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS mosque_posts_unique_event
  ON public.mosque_posts (mosque_id, title, event_start)
  WHERE event_start IS NOT NULL;
