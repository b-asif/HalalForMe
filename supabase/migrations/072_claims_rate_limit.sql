-- ================================================================
-- Migration 072: Rate limit on restaurant claims
--
-- Limits each authenticated user to 5 pending or total claims per
-- rolling 24-hour window. Enforced at the database level via the
-- RLS INSERT policy so it applies regardless of whether the request
-- comes through the app or directly via the API.
--
-- The existing "claims_owner_insert" policy (migration 029) had no
-- throttle. This replaces it with an identical policy plus the count
-- check, following the same pattern as submissions_owner_insert
-- (migration 032).
-- ================================================================

DROP POLICY IF EXISTS "claims_owner_insert" ON public.restaurant_claims;
CREATE POLICY "claims_owner_insert"
  ON public.restaurant_claims FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      SELECT COUNT(*)
      FROM public.restaurant_claims c
      WHERE c.user_id = auth.uid()
        AND c.created_at > now() - interval '24 hours'
    ) < 5
  );
