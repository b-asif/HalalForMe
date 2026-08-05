-- ================================================================
-- Migration 032: Rate limit on restaurant submissions
--
-- Limits each authenticated user to 3 submissions per rolling 24-hour
-- window. Enforced at the database level via the RLS INSERT policy so
-- it applies regardless of how the insert reaches the database (app,
-- direct API call, etc.).
--
-- The client (app/submit-restaurant.tsx) performs the same count check
-- before uploading photos, so users see a friendly error message rather
-- than the generic RLS violation Postgres would otherwise return.
--
-- Idempotent: drops and recreates the named policy. The pre-existing
-- unnamed "users can submit" policy (TO public) is also dropped here —
-- it is a broader, weaker duplicate of submissions_owner_insert and
-- having both active means the rate-limit check can be bypassed by the
-- public-role policy passing first (Postgres ORs permissive policies).
-- ================================================================

-- Drop the weaker pre-existing policy that would bypass the rate limit.
-- (Created outside migration tracking; safe to drop — submissions_owner_insert
-- covers the same insert permission with stricter constraints.)
DROP POLICY IF EXISTS "users can submit" ON public.submissions;

-- Recreate the owner insert policy with the rate limit in WITH CHECK.
DROP POLICY IF EXISTS "submissions_owner_insert" ON public.submissions;
CREATE POLICY "submissions_owner_insert"
  ON public.submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      SELECT COUNT(*) FROM public.submissions s
      WHERE s.user_id = auth.uid()
        AND s.created_at > now() - interval '24 hours'
    ) < 3
  );
