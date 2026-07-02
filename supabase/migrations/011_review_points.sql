-- 011_review_points.sql
-- Awards 15 points when a user review is approved by an admin.

-- ─── Extend the type constraint ───────────────────────────────────────────────
-- Drop and recreate to add 'review_approved' to the allowed values.

ALTER TABLE contribution_points DROP CONSTRAINT IF EXISTS contribution_points_type_check;
ALTER TABLE contribution_points ADD CONSTRAINT contribution_points_type_check
  CHECK (type IN ('restaurant_approved', 'photo_approved', 'review_approved'));

-- ─── Trigger: award points when a review is approved ─────────────────────────

CREATE OR REPLACE FUNCTION award_review_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO contribution_points (user_id, type, reference_id, points)
    VALUES (NEW.user_id, 'review_approved', NEW.id, 15)
    ON CONFLICT (type, reference_id) DO NOTHING;

    PERFORM check_and_award_badges(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_approved ON reviews;
CREATE TRIGGER trg_review_approved
  AFTER UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION award_review_points();

-- ─── Auto-approve review photos when the parent review is approved ────────────
-- When admin approves a review, any restaurant_photos linked via review_id
-- are automatically approved. This surfaces them in the photo tabs immediately
-- and also fires trg_photo_approved (awarding +10 pts per photo).

CREATE OR REPLACE FUNCTION approve_review_photos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE restaurant_photos
    SET status = 'approved'
    WHERE review_id = NEW.id
      AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approve_review_photos ON reviews;
CREATE TRIGGER trg_approve_review_photos
  AFTER UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION approve_review_photos();
