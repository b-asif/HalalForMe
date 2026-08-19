-- 069_msa_requests_admin_rls.sql
--
-- Adds the missing admin read/update policies on msa_onboarding_requests.
-- Without these, admins see zero rows in the admin panel even though
-- the UI and RPCs are correct.

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
