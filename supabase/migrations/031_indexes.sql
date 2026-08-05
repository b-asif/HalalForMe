-- ================================================================
-- Migration 031: Missing indexes on core tables
--
-- All indexes are CREATE INDEX IF NOT EXISTS — safe to re-run.
--
-- Rationale per table:
--
-- reviews
--   • idx_reviews_restaurant_id: restaurant detail page queries all reviews
--     for a given restaurant. The existing UNIQUE (user_id, restaurant_id)
--     has user_id as the left column, so restaurant_id-only lookups can't
--     use it — they fall back to a full table scan.
--   • idx_reviews_status_created_at: admin moderation screen filters by
--     status then orders by created_at DESC. The existing reviews_status_idx
--     (migration 006) covers the filter but forces a filesort for the ORDER
--     BY. This composite eliminates the sort entirely. Also covers the count
--     queries on status alone (left-prefix rule).
--
-- submissions
--   No indexes exist on this table at all (only the PK).
--   • idx_submissions_user_id: user-facing screens (my-submissions, notifications)
--     filter by user_id and order by created_at.
--   • idx_submissions_status_created_at: admin dashboard fetches pending/approved
--     submissions ordered by created_at; also covers the status-only count query.
--
-- restaurant_claims
--   The UNIQUE (restaurant_id, user_id) constraint creates an index with
--   restaurant_id as the left column. That covers restaurant_id lookups but
--   NOT user_id-only lookups.
--   • idx_restaurant_claims_user_id: the user notifications screen queries
--     claims by user_id and orders by created_at.
--   • idx_restaurant_claims_status_created_at: admin claims screen and the
--     dashboard count query both filter by status; the list view also orders
--     by created_at.
--
-- admin_notifications
--   No indexes exist on this table at all (only the PK).
--   • idx_admin_notifications_created_at: the notification list is always
--     ordered by created_at DESC with LIMIT 100.
--   • idx_admin_notifications_is_read: two separate queries — a count of
--     unread notifications (dashboard) and a bulk mark-all-read UPDATE —
--     both filter by is_read = false. Partial index keeps it tiny since
--     most notifications will be read over time.
--
-- restaurants
--   • idx_restaurants_lat_lng: both the home screen and the search screen
--     do bounding-box range queries (.gte('lat').lte('lat').gte('lng').lte('lng'))
--     with no geo index. Without this, every geo query is a full table scan.
--     A composite (lat, lng) lets Postgres narrow by lat range using the index,
--     then filter lng in the result set — far better than a seq scan.
--     (A PostGIS point index would be ideal long-term but requires the
--     extension; this composite is a pragmatic improvement with no new deps.)
-- ================================================================

-- ----------------------------------------------------------------
-- reviews
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_id
  ON public.reviews (restaurant_id);

-- Composite covers: WHERE status = ? ORDER BY created_at DESC
-- and also: WHERE status = ? (count queries, left-prefix rule)
CREATE INDEX IF NOT EXISTS idx_reviews_status_created_at
  ON public.reviews (status, created_at DESC);

-- ----------------------------------------------------------------
-- submissions
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_submissions_user_id
  ON public.submissions (user_id);

CREATE INDEX IF NOT EXISTS idx_submissions_status_created_at
  ON public.submissions (status, created_at DESC);

-- ----------------------------------------------------------------
-- restaurant_claims
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_restaurant_claims_user_id
  ON public.restaurant_claims (user_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_claims_status_created_at
  ON public.restaurant_claims (status, created_at DESC);

-- ----------------------------------------------------------------
-- admin_notifications
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON public.admin_notifications (created_at DESC);

-- Partial index: only indexes unread rows, stays small as notifications
-- accumulate and get marked read over time.
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON public.admin_notifications (id)
  WHERE is_read = false;

-- ----------------------------------------------------------------
-- restaurants (geo bounding-box queries)
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_restaurants_lat_lng
  ON public.restaurants (lat, lng);
