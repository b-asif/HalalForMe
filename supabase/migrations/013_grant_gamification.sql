-- 013_grant_gamification.sql
-- Grants read access on gamification tables and views to the authenticated role.
-- Supabase does not automatically grant SELECT on new tables/views, so without
-- these the client queries silently return null and points always show as 0.

-- Tables
GRANT SELECT ON contribution_points TO authenticated;
GRANT SELECT ON user_badges         TO authenticated;

-- Leaderboard views (readable by authenticated and anon for public leaderboard)
GRANT SELECT ON alltime_leaderboard TO authenticated, anon;
GRANT SELECT ON monthly_leaderboard TO authenticated, anon;
