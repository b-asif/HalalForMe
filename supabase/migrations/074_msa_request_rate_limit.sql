-- ================================================================
-- Migration 074: Rate limit on MSA onboarding request submissions
--
-- Problem: "Users insert own requests" policy (migration 065) had no
-- throttle. A user could flood the admin queue with MSA onboarding
-- requests, burying legitimate submissions.
--
-- Fix: replace the open INSERT policy with one that caps each user
-- at 3 pending or total requests per rolling 7-day window. This is
-- generous for legitimate use (a student submits once, maybe retries
-- once after a correction) while blocking queue-flooding abuse.
--
-- The 7-day window (vs 24h for submissions/claims) reflects that MSA
-- requests are lower-volume and users may legitimately re-submit
-- after being rejected with corrections.
-- ================================================================

DROP POLICY IF EXISTS "Users insert own requests"         ON public.msa_onboarding_requests;
DROP POLICY IF EXISTS "Users can insert own onboarding requests" ON public.msa_onboarding_requests;

CREATE POLICY "Users insert own requests"
  ON public.msa_onboarding_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      SELECT COUNT(*)
      FROM public.msa_onboarding_requests r
      WHERE r.user_id    = auth.uid()
        AND r.created_at > now() - interval '7 days'
    ) < 3
  );
