-- 010_leaderboard_privacy.sql
-- Adds opt-in anonymity for the public leaderboard.
-- When true the user appears with a generated pseudonym instead of their real name.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS leaderboard_anonymous BOOLEAN NOT NULL DEFAULT false;
