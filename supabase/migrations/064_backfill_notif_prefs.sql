-- 064_backfill_notif_prefs.sql
--
-- Backfills campus_notification_preferences for any campus_follows row
-- that is missing one or more category preferences.
-- Safe to run multiple times (INSERT ... ON CONFLICT DO NOTHING).

INSERT INTO public.campus_notification_preferences (user_id, university_id, category, enabled)
SELECT
  cf.user_id,
  cf.university_id,
  cats.category,
  true
FROM public.campus_follows cf
CROSS JOIN (
  VALUES ('events'), ('announcements'), ('jummah'), ('prayer')
) AS cats(category)
ON CONFLICT (user_id, university_id, category) DO NOTHING;
