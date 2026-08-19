-- 070_msa_requests_profiles_fk_and_rls.sql
--
-- 1. Adds a FK from msa_onboarding_requests.user_id → public.profiles(id)
--    so PostgREST can resolve profiles(name) in the admin join query.
--    (The existing FK to auth.users(id) stays — Postgres allows multiple FKs
--    on the same column pointing to different tables.)
--
-- 2. Adds the missing admin SELECT / UPDATE RLS policies (idempotent).

-- ── 1. Foreign key to profiles ────────────────────────────────────────────────
ALTER TABLE public.msa_onboarding_requests
  ADD CONSTRAINT msa_onboarding_requests_user_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ── 2. Admin RLS policies (idempotent) ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'msa_onboarding_requests'
      AND policyname = 'Admins read all requests'
  ) THEN
    CREATE POLICY "Admins read all requests"
      ON public.msa_onboarding_requests FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND is_admin = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'msa_onboarding_requests'
      AND policyname = 'Admins update all requests'
  ) THEN
    CREATE POLICY "Admins update all requests"
      ON public.msa_onboarding_requests FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND is_admin = true
        )
      );
  END IF;
END $$;
