-- 014_backfill_points.sql
-- One-time backfill: award points for all content that was approved
-- before the triggers were installed (migrations 009/011).
-- ON CONFLICT DO NOTHING prevents double-awarding if any rows already exist.

-- Approved restaurant submissions → 50 pts each
INSERT INTO contribution_points (user_id, type, reference_id, points)
SELECT user_id, 'restaurant_approved', id, 50
FROM submissions
WHERE status = 'approved'
  AND user_id IS NOT NULL
ON CONFLICT (type, reference_id) DO NOTHING;

-- Approved reviews → 15 pts each
INSERT INTO contribution_points (user_id, type, reference_id, points)
SELECT user_id, 'review_approved', id, 15
FROM reviews
WHERE status = 'approved'
  AND user_id IS NOT NULL
ON CONFLICT (type, reference_id) DO NOTHING;

-- Approved restaurant photos → 10 pts each
INSERT INTO contribution_points (user_id, type, reference_id, points)
SELECT user_id, 'photo_approved', id, 10
FROM restaurant_photos
WHERE status = 'approved'
  AND user_id IS NOT NULL
ON CONFLICT (type, reference_id) DO NOTHING;

-- Award any badges earned from the backfilled points
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT user_id FROM contribution_points
  LOOP
    PERFORM check_and_award_badges(r.user_id);
  END LOOP;
END;
$$;
