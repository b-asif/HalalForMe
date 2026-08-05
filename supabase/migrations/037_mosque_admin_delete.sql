-- 037_mosque_admin_delete.sql
-- Allow admins to delete mosque records (e.g. to clean up duplicates).
-- Cascade handles related rows automatically:
--   mosque_posts        — ON DELETE CASCADE (migration 017)
--   mosque_sync_cache   — ON DELETE CASCADE (migration 025)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'mosques'
      AND policyname = 'Admins can delete mosques'
  ) THEN
    CREATE POLICY "Admins can delete mosques"
      ON public.mosques FOR DELETE
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;
END;
$$;
