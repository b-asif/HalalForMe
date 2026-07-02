-- 009_gamification.sql
-- Contribution gamification: points, badges, leaderboards

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- Source-of-truth log of every point event
-- UNIQUE(type, reference_id) prevents double-awarding if an admin
-- un-approves and re-approves the same submission.
CREATE TABLE IF NOT EXISTS contribution_points (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN ('restaurant_approved', 'photo_approved')),
  reference_id UUID        NOT NULL,
  points       INTEGER     NOT NULL CHECK (points > 0),
  earned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type, reference_id)
);

-- One row per user per badge — earned once, never lost
CREATE TABLE IF NOT EXISTS user_badges (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_type  TEXT        NOT NULL CHECK (badge_type IN (
    'first_scout',    -- first approved restaurant submission
    'scout',          -- 5 approved restaurant submissions
    'super_scout',    -- 25 approved restaurant submissions
    'lensman',        -- 10 approved photos
    'community_star'  -- top 3 on any monthly leaderboard (awarded manually / future automation)
  )),
  earned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, badge_type)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contribution_points_user  ON contribution_points (user_id);
CREATE INDEX IF NOT EXISTS idx_contribution_points_month ON contribution_points (earned_at);
CREATE INDEX IF NOT EXISTS idx_user_badges_user          ON user_badges (user_id);

-- ─── Leaderboard views ────────────────────────────────────────────────────────

-- RANK() is used instead of ROW_NUMBER() so tied users share the same rank
-- (e.g. two users with 100 pts are both rank 1, next is rank 3).
-- Rankings use UTC month boundaries — this is documented intentional behaviour.
CREATE OR REPLACE VIEW alltime_leaderboard AS
  SELECT
    cp.user_id,
    SUM(cp.points)                                      AS total_points,
    RANK() OVER (ORDER BY SUM(cp.points) DESC)          AS rank
  FROM contribution_points cp
  GROUP BY cp.user_id;

CREATE OR REPLACE VIEW monthly_leaderboard AS
  SELECT
    cp.user_id,
    SUM(cp.points)                                      AS total_points,
    RANK() OVER (ORDER BY SUM(cp.points) DESC)          AS rank
  FROM contribution_points cp
  WHERE cp.earned_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')
  GROUP BY cp.user_id;

-- ─── Badge award function ─────────────────────────────────────────────────────
-- Called from triggers after each point is inserted.

CREATE OR REPLACE FUNCTION check_and_award_badges(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  approved_restaurants INTEGER;
  approved_photos      INTEGER;
BEGIN
  SELECT COUNT(*) INTO approved_restaurants
  FROM contribution_points
  WHERE user_id = p_user_id AND type = 'restaurant_approved';

  SELECT COUNT(*) INTO approved_photos
  FROM contribution_points
  WHERE user_id = p_user_id AND type = 'photo_approved';

  IF approved_restaurants >= 1 THEN
    INSERT INTO user_badges (user_id, badge_type)
    VALUES (p_user_id, 'first_scout')
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;

  IF approved_restaurants >= 5 THEN
    INSERT INTO user_badges (user_id, badge_type)
    VALUES (p_user_id, 'scout')
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;

  IF approved_restaurants >= 25 THEN
    INSERT INTO user_badges (user_id, badge_type)
    VALUES (p_user_id, 'super_scout')
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;

  IF approved_photos >= 10 THEN
    INSERT INTO user_badges (user_id, badge_type)
    VALUES (p_user_id, 'lensman')
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;
END;
$$;

-- ─── Trigger: award points when a submission is approved ──────────────────────

CREATE OR REPLACE FUNCTION award_submission_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO contribution_points (user_id, type, reference_id, points)
    VALUES (NEW.user_id, 'restaurant_approved', NEW.id, 50)
    ON CONFLICT (type, reference_id) DO NOTHING;

    PERFORM check_and_award_badges(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submission_approved ON submissions;
CREATE TRIGGER trg_submission_approved
  AFTER UPDATE ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION award_submission_points();

-- ─── Trigger: award points when a restaurant photo is approved ────────────────

CREATE OR REPLACE FUNCTION award_photo_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO contribution_points (user_id, type, reference_id, points)
    VALUES (NEW.user_id, 'photo_approved', NEW.id, 10)
    ON CONFLICT (type, reference_id) DO NOTHING;

    PERFORM check_and_award_badges(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_photo_approved ON restaurant_photos;
CREATE TRIGGER trg_photo_approved
  AFTER UPDATE ON restaurant_photos
  FOR EACH ROW
  EXECUTE FUNCTION award_photo_points();

-- ─── Row-level security ───────────────────────────────────────────────────────

ALTER TABLE contribution_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges         ENABLE ROW LEVEL SECURITY;

-- Users can read their own points; leaderboard queries use the views (no RLS on views)
CREATE POLICY "Users can read own points"
  ON contribution_points FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- NOTE: No INSERT policy needed for contribution_points.
-- Inserts happen exclusively via SECURITY DEFINER triggers (award_submission_points,
-- award_photo_points) which run as the DB owner and bypass RLS automatically.
-- Granting a permissive INSERT policy here would allow any authenticated user
-- to award themselves arbitrary points directly, bypassing the approval workflow.

-- Users can read their own badges
CREATE POLICY "Users can read own badges"
  ON user_badges FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- NOTE: No INSERT policy needed for user_badges for the same reason as above.
-- Badges are awarded only via check_and_award_badges() called from SECURITY DEFINER triggers.
