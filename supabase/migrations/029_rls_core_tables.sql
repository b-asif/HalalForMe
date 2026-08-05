-- ================================================================
-- Migration 029: Enable Row-Level Security on untracked core tables
--
-- These tables (profiles, restaurants, reviews, saved_restaurants,
-- submissions, restaurant_claims, push_tokens, admin_notifications)
-- were created directly in Supabase before migration tracking started
-- and have never had RLS or policies applied via a tracked migration.
--
-- Every statement is idempotent:
--   • ENABLE ROW LEVEL SECURITY is a no-op if already enabled
--   • DROP POLICY IF EXISTS + CREATE POLICY avoids duplicate-name errors
--     on re-run (same pattern used in 015_scan_reports.sql)
--
-- Access model summary:
--   profiles           — public read; owner update; admin update any
--   restaurants        — public read; admin write
--   reviews            — public read; owner insert/update/delete; admin update any
--   saved_restaurants  — owner-only (private favourites)
--   submissions        — owner read/insert; admin read/update all
--   restaurant_claims  — owner read/insert; admin read/update all
--   push_tokens        — owner-only (device tokens are private)
--   admin_notifications — admin-only read/write
-- ================================================================

-- ----------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_public_read"   ON public.profiles;
CREATE POLICY "profiles_public_read"
  ON public.profiles FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "profiles_owner_update"  ON public.profiles;
CREATE POLICY "profiles_owner_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_admin_update"  ON public.profiles;
CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- ----------------------------------------------------------------
-- restaurants
-- Public discovery data: anyone can read; only admins can write.
-- Owners can update their own claimed restaurant (owner_id = auth.uid()).
--
-- NOTE: Per a 2026-07-11 live DB audit (see CHANGELOG.md), `restaurants`
-- already had some RLS policies applied outside migration tracking. Those
-- existing policies may remain alongside these. `DROP POLICY IF EXISTS`
-- only drops policies with these exact names, so any other existing
-- policies are left in place.
-- ----------------------------------------------------------------
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurants_public_read"  ON public.restaurants;
CREATE POLICY "restaurants_public_read"
  ON public.restaurants FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "restaurants_owner_update" ON public.restaurants;
CREATE POLICY "restaurants_owner_update"
  ON public.restaurants FOR UPDATE
  TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "restaurants_admin_all"    ON public.restaurants;
CREATE POLICY "restaurants_admin_all"
  ON public.restaurants FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- ----------------------------------------------------------------
-- reviews
-- Public read (reviews are visible to everyone browsing a restaurant).
-- Owners can create/update/delete their own reviews.
-- Admins can update any review (moderation: approve/reject).
-- ----------------------------------------------------------------
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_public_read"   ON public.reviews;
CREATE POLICY "reviews_public_read"
  ON public.reviews FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "reviews_owner_insert"  ON public.reviews;
CREATE POLICY "reviews_owner_insert"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_owner_update"  ON public.reviews;
CREATE POLICY "reviews_owner_update"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_owner_delete"  ON public.reviews;
CREATE POLICY "reviews_owner_delete"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_admin_update"  ON public.reviews;
CREATE POLICY "reviews_admin_update"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- ----------------------------------------------------------------
-- saved_restaurants
-- Strictly private: users can only see and manage their own saved list.
-- ----------------------------------------------------------------
ALTER TABLE public.saved_restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_restaurants_owner_all" ON public.saved_restaurants;
CREATE POLICY "saved_restaurants_owner_all"
  ON public.saved_restaurants FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- submissions
-- Users can submit restaurants and read their own submissions.
-- Admins can read and update all submissions (approval workflow).
-- ----------------------------------------------------------------
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submissions_owner_insert" ON public.submissions;
CREATE POLICY "submissions_owner_insert"
  ON public.submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "submissions_owner_read"   ON public.submissions;
CREATE POLICY "submissions_owner_read"
  ON public.submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "submissions_admin_read"   ON public.submissions;
CREATE POLICY "submissions_admin_read"
  ON public.submissions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

DROP POLICY IF EXISTS "submissions_admin_update" ON public.submissions;
CREATE POLICY "submissions_admin_update"
  ON public.submissions FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- ----------------------------------------------------------------
-- restaurant_claims
-- Users can submit and read their own claims.
-- Admins can read and update all claims (approval workflow).
-- ----------------------------------------------------------------
ALTER TABLE public.restaurant_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims_owner_insert" ON public.restaurant_claims;
CREATE POLICY "claims_owner_insert"
  ON public.restaurant_claims FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "claims_owner_read"   ON public.restaurant_claims;
CREATE POLICY "claims_owner_read"
  ON public.restaurant_claims FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "claims_admin_read"   ON public.restaurant_claims;
CREATE POLICY "claims_admin_read"
  ON public.restaurant_claims FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

DROP POLICY IF EXISTS "claims_admin_update" ON public.restaurant_claims;
CREATE POLICY "claims_admin_update"
  ON public.restaurant_claims FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));

-- ----------------------------------------------------------------
-- push_tokens
-- Strictly private: users can only upsert/read their own device tokens.
-- Edge functions (notify-admin, notify-user, weekly-digest) access
-- push_tokens via the service role key, which bypasses RLS entirely —
-- so no special admin policy is needed here.
-- ----------------------------------------------------------------
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_tokens_owner_all" ON public.push_tokens;
CREATE POLICY "push_tokens_owner_all"
  ON public.push_tokens FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- admin_notifications
-- Internal admin-only table. No regular user should ever read or
-- write this table. Edge functions write via the service role key
-- (bypasses RLS), so only SELECT needs a policy here.
-- ----------------------------------------------------------------
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notifications_admin_all" ON public.admin_notifications;
CREATE POLICY "admin_notifications_admin_all"
  ON public.admin_notifications FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
  ));
