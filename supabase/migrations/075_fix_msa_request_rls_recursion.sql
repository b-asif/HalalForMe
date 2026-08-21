-- ================================================================
-- Migration 075: Fix infinite recursion in msa_onboarding_requests
--                INSERT policy.
--
-- Root cause: migration 074's rate-limit policy contained a
-- self-referential subquery (SELECT COUNT(*) FROM msa_onboarding_requests)
-- inside the WITH CHECK clause of an INSERT policy on the same table.
-- Postgres evaluates that subquery through RLS, which re-triggers the
-- same policy, causing infinite recursion — blocking all student
-- MSA claim submissions with "infinite recursion detected in policy
-- for relation msa_onboarding_requests".
--
-- Fix: move the count into a SECURITY DEFINER function, which runs as
-- the table owner and bypasses RLS, breaking the cycle.
-- ================================================================

CREATE OR REPLACE FUNCTION public.count_recent_msa_requests(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)
  FROM public.msa_onboarding_requests
  WHERE user_id    = p_user_id
    AND created_at > now() - interval '7 days';
$$;

-- Replace the recursive policy with one that calls the helper function
DROP POLICY IF EXISTS "Users insert own requests" ON public.msa_onboarding_requests;

CREATE POLICY "Users insert own requests"
  ON public.msa_onboarding_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.count_recent_msa_requests(auth.uid()) < 3
  );
