-- ================================================================
-- Migration 030: Baseline CREATE TABLE for untracked core tables
--
-- These eight tables were created directly in Supabase before migration
-- tracking started. This migration makes the schema reproducible from
-- supabase/migrations/ alone, captured from the live database on 2026-07-15
-- via information_schema + pg_policies introspection.
--
-- Every statement uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it is
-- a no-op on the live database but fully correct on a fresh deployment.
--
-- ORDERING NOTE: On a fresh deployment this migration must be applied
-- BEFORE migrations 001–029, since those only ALTER these tables. The
-- numbering (030) reflects when the baseline was documented, not when
-- the tables were created. A future cleanup pass could renumber everything,
-- but that would invalidate migration history on existing deployments.
--
-- RLS: ENABLE ROW LEVEL SECURITY is repeated here for fresh deployments;
-- the actual policy definitions live in 029_rls_core_tables.sql.
-- Pre-existing policies (created before 029) are documented in the
-- "Pre-existing policies" section of this file's comments — they are
-- already present on the live database and do not need to be recreated.
--
-- SECURITY FIX ALSO INCLUDED: the pre-existing "Service role reads all"
-- policy on push_tokens (TO public, USING (true)) exposes all device tokens
-- to unauthenticated callers. It is dropped here.
-- ================================================================

-- ================================================================
-- profiles
-- Linked 1:1 to auth.users. The id FK ensures a profile row can only
-- ever be created for a real auth user, and cascades on user deletion.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   uuid        NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 text,
  avatar_url           text,
  dietary_preferences  text[]      NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  is_admin             boolean              DEFAULT false,
  tos_accepted_at      timestamptz,
  leaderboard_anonymous boolean    NOT NULL DEFAULT false
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Pre-existing policies (present before 029, still active):
--   "Users can read own profile"       SELECT  auth.uid() = id
--   "Users can update own profile"     UPDATE  auth.uid() = id
--   "profiles: authenticated read"     SELECT  auth.uid() IS NOT NULL
--   "profiles: insert own"             INSERT  id = auth.uid()
--   "profiles: update own"             UPDATE  id = auth.uid()
-- Named policies added by 029: profiles_public_read, profiles_owner_update, profiles_admin_update

-- ================================================================
-- restaurants
-- Core discovery table. submitted_by tracks who submitted an unverified
-- listing; owner_id is set after a claim is approved.
-- Column 22 (ordinal_position) is absent — a column was dropped live.
-- avg_rating and review_count exist as nullable columns (contrary to an
-- old DATABASE_SCHEMA.md note); they may be populated by triggers or
-- periodically recomputed. ratings are also computed client-side as fallback.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.restaurants (
  id                 uuid             NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text             NOT NULL,
  address            text,
  lat                double precision,
  lng                double precision,
  cuisine_type       text,
  primary_certifier  text             NOT NULL DEFAULT 'unknown',
  is_verified        boolean          NOT NULL DEFAULT false,
  phone              text,
  website            text,
  submitted_by       uuid             REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz      NOT NULL DEFAULT now(),
  updated_at         timestamptz      NOT NULL DEFAULT now(),
  image_url          text,
  confidence         text,
  cuisine            text,
  osm_id             text,
  status             text,
  reason             text,
  source             text,
  certifiers         text[],
  -- ordinal 22 absent: column was dropped on the live database
  user_id            uuid,
  gallery_images     text[],
  opening_hours      jsonb,
  categorized_photos jsonb            DEFAULT '{"food": [], "inside": [], "outside": []}',
  avg_rating         numeric,
  review_count       integer,
  owner_id           uuid             REFERENCES auth.users(id) ON DELETE NO ACTION,
  instagram_handle   text,
  zabihah_status     text,
  zabihah_notes      text,
  category           text             NOT NULL DEFAULT 'restaurant',
  has_prayer_room    boolean          NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_osm_id_unique ON public.restaurants (osm_id);

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- Pre-existing policies (present before 029, still active):
--   "public read restaurants"                  SELECT  true
--   "restaurants: public read"                 SELECT  true  (duplicate of above)
--   "Admins can insert restaurants"            INSERT  admin check
--   "Users can insert their own restaurants"   INSERT  auth.uid() = user_id
--   "restaurants: authenticated insert"        INSERT  auth.uid() IS NOT NULL AND submitted_by = auth.uid()
--   "Admins can update restaurants"            UPDATE  admin check
--   "Admins can update owner_id"              UPDATE  admin check (no WITH CHECK)
--   "restaurants: submitter update unverified" UPDATE  submitted_by = auth.uid() AND is_verified = false
--   "Admins can delete restaurants"            DELETE  admin check
--   "restaurants: submitter delete unverified" DELETE  submitted_by = auth.uid() AND is_verified = false
-- Named policies added by 029: restaurants_public_read, restaurants_owner_update, restaurants_admin_all

-- ================================================================
-- reviews
-- One review per user per restaurant (unique constraint enforces this).
-- status: 'pending' | 'approved' | 'rejected' — managed by admin moderation.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id                      uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  restaurant_id           uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rating                  smallint    NOT NULL,
  halal_compliance_rating smallint    NOT NULL,
  comment                 text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  photo_urls              text[],
  food_rating             integer,
  ambiance_rating         integer,
  service_rating          integer,
  value_rating            integer,
  status                  text        NOT NULL DEFAULT 'approved',
  is_anonymous            boolean              DEFAULT false,
  UNIQUE (user_id, restaurant_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Pre-existing policies (present before 029, still active):
--   "reviews: public read"            SELECT  true
--   "reviews: authenticated insert"   INSERT  auth.uid() = user_id
--   "reviews: update own"             UPDATE  auth.uid() = user_id
--   "reviews: delete own"             DELETE  auth.uid() = user_id
--   "Admins can update any review"    UPDATE  admin check
-- Named policies added by 029: reviews_public_read, reviews_owner_insert,
--   reviews_owner_update, reviews_owner_delete, reviews_admin_update

-- ================================================================
-- saved_restaurants
-- Private user favourites. One row per user+restaurant pair.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.saved_restaurants (
  id            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, restaurant_id)
);

ALTER TABLE public.saved_restaurants ENABLE ROW LEVEL SECURITY;

-- Pre-existing policies (present before 029, still active):
--   "Users can view their own saves"    SELECT  auth.uid() = user_id
--   "Users can insert their own saves"  INSERT  auth.uid() = user_id
--   "Users can delete their own saves"  DELETE  auth.uid() = user_id
-- Named policies added by 029: saved_restaurants_owner_all

-- ================================================================
-- submissions
-- User-submitted restaurant listings pending admin review.
-- restaurant_id is set by an admin when the submission is approved and
-- a new restaurants row is created from it.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.submissions (
  id                      uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE NO ACTION,
  name                    text        NOT NULL,
  address                 text        NOT NULL,
  cuisine_type            text,
  phone                   text,
  website                 text,
  certification_photo_url text        NOT NULL,
  notes                   text,
  status                  text                 DEFAULT 'pending',
  reviewer_notes          text,
  created_at              timestamptz          DEFAULT now(),
  food_photo_urls         text[],
  restaurant_photo_urls   text[],
  restaurant_id           uuid        REFERENCES public.restaurants(id) ON DELETE NO ACTION,
  lat                     double precision,
  lng                     double precision
);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Pre-existing policies (present before 029, still active):
--   "users can submit"              INSERT  auth.uid() = user_id
--   "users see own submissions"     SELECT  auth.uid() = user_id  (duplicate of "select submissions" for own rows)
--   "select submissions"            SELECT  auth.uid() = user_id OR admin check
--   "Admins can update submissions" UPDATE  admin check (with WITH CHECK)
--   "admins can update submissions" UPDATE  admin check (no WITH CHECK) — near-duplicate of above
-- Named policies added by 029: submissions_owner_insert, submissions_owner_read,
--   submissions_admin_read, submissions_admin_update

-- ================================================================
-- restaurant_claims
-- Users claim ownership of an existing restaurant listing.
-- One pending or approved claim per user+restaurant pair (unique constraint).
-- reviewed_at is set when an admin approves or rejects the claim.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_claims (
  id             uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_name   text        NOT NULL,
  contact_email  text        NOT NULL,
  role           text        NOT NULL DEFAULT 'owner',
  message        text,
  status         text        NOT NULL DEFAULT 'pending',
  created_at     timestamptz          DEFAULT now(),
  reviewed_at    timestamptz,
  proof_url      text,
  UNIQUE (restaurant_id, user_id)
);

ALTER TABLE public.restaurant_claims ENABLE ROW LEVEL SECURITY;

-- Pre-existing policies (present before 029, still active):
--   "Users can insert own claims"   INSERT  auth.uid() = user_id
--   "Users can view own claims"     SELECT  auth.uid() = user_id
--   "Admins can view all claims"    SELECT  admin check
--   "Admins can update claims"      UPDATE  admin check
-- Named policies added by 029: claims_owner_insert, claims_owner_read,
--   claims_admin_read, claims_admin_update

-- ================================================================
-- push_tokens
-- Device push notification tokens. One row per (user_id, token) pair.
-- Edge functions (notify-admin, notify-user, weekly-digest) read this
-- table via the service role key, which bypasses RLS — so no admin
-- SELECT policy is needed here.
--
-- SECURITY FIX: drop the pre-existing "Service role reads all" policy
-- (TO public, USING (true)) which allowed any unauthenticated caller to
-- read every user's device token.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text        NOT NULL,
  created_at timestamptz          DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Drop the insecure pre-existing policy that exposed all tokens to public reads.
DROP POLICY IF EXISTS "Service role reads all" ON public.push_tokens;

-- Pre-existing policy that remains (already correct):
--   "Users manage own tokens"  ALL  auth.uid() = user_id  (no WITH CHECK — harmless, intent is correct)
-- Named policies added by 029: push_tokens_owner_all

-- ================================================================
-- admin_notifications
-- Internal admin-only notification feed. Written exclusively by Edge
-- Functions (notify-admin, weekly-digest) via the service role key.
-- No regular user should ever read or write this table directly.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id         uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text        NOT NULL,
  title      text        NOT NULL,
  body       text        NOT NULL,
  link_type  text,
  link_id    text,
  is_read    boolean              DEFAULT false,
  created_at timestamptz          DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Pre-existing policy (present before 029, still active):
--   "Admins can manage notifications"  ALL  admin check  (TO public — slightly broad role target,
--                                                          but USING clause is correct)
-- Named policies added by 029: admin_notifications_admin_all
