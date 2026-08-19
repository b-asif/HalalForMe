-- Migration 060: Fix infinite recursion in campus RLS policies
--
-- Root cause: the msa_members SELECT policy for admins referenced msa_members
-- itself ("admins can see all members of their MSA"), causing infinite recursion
-- when any campus table policy tried to check membership via a subquery on
-- msa_members.
--
-- Fix: introduce a SECURITY DEFINER function that reads msa_members with
-- elevated privileges (bypassing RLS), then rewrite all campus-table write
-- policies and the msa_members admin-select policy to use this function.

-- ─── 1. Security-definer helper ──────────────────────────────────────────────
-- Returns TRUE if the calling user has an active admin or editor role in the
-- given MSA. Runs as the function owner (bypasses RLS on msa_members).

CREATE OR REPLACE FUNCTION public.is_active_msa_member(p_msa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.msa_members
    WHERE user_id = auth.uid()
      AND msa_id  = p_msa_id
      AND status  = 'active'
      AND role    IN ('admin', 'editor')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_msa_admin(p_msa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.msa_members
    WHERE user_id = auth.uid()
      AND msa_id  = p_msa_id
      AND status  = 'active'
      AND role    = 'admin'
  );
$$;

-- ─── 2. Fix msa_members policies (self-referential → use function) ────────────

-- Drop all existing policies on msa_members
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'msa_members' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.msa_members';
  END LOOP;
END $$;

-- Users can always read their own membership rows (no recursion)
CREATE POLICY "msa_members_select_own"
  ON public.msa_members FOR SELECT
  USING (user_id = auth.uid());

-- Global admins can read all membership rows
CREATE POLICY "msa_members_select_global_admin"
  ON public.msa_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- MSA admins can read all memberships for their MSA (uses function — no recursion)
CREATE POLICY "msa_members_select_msa_admin"
  ON public.msa_members FOR SELECT
  USING (public.is_msa_admin(msa_id));

-- Only global admins can insert/update/delete memberships (MSA admins use the RPC)
CREATE POLICY "msa_members_insert_admin"
  ON public.msa_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "msa_members_update_admin"
  ON public.msa_members FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "msa_members_delete_admin"
  ON public.msa_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ─── 3. Rewrite campus-table write policies to use the function ───────────────
-- This ensures the membership check never triggers msa_members RLS recursively.

-- Helper macro used in each table's DROP + CREATE block:
-- Write access = is_active_msa_member(msa_id) OR global admin

DO $$ BEGIN

  -- msas
  DROP POLICY IF EXISTS "msas_update_member" ON public.msas;
  DROP POLICY IF EXISTS "msas_update_admin"  ON public.msas;
  CREATE POLICY "msas_write"
    ON public.msas FOR UPDATE
    USING (
      public.is_active_msa_member(id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

  -- campus_prayer_spaces
  DROP POLICY IF EXISTS "campus_prayer_spaces_insert_member" ON public.campus_prayer_spaces;
  DROP POLICY IF EXISTS "campus_prayer_spaces_update_member" ON public.campus_prayer_spaces;
  DROP POLICY IF EXISTS "campus_prayer_spaces_delete_member" ON public.campus_prayer_spaces;
  CREATE POLICY "campus_prayer_spaces_insert"
    ON public.campus_prayer_spaces FOR INSERT
    WITH CHECK (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_prayer_spaces_update"
    ON public.campus_prayer_spaces FOR UPDATE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_prayer_spaces_delete"
    ON public.campus_prayer_spaces FOR DELETE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

  -- campus_prayer_times
  DROP POLICY IF EXISTS "campus_prayer_times_insert_member" ON public.campus_prayer_times;
  DROP POLICY IF EXISTS "campus_prayer_times_update_member" ON public.campus_prayer_times;
  DROP POLICY IF EXISTS "campus_prayer_times_delete_member" ON public.campus_prayer_times;
  CREATE POLICY "campus_prayer_times_insert"
    ON public.campus_prayer_times FOR INSERT
    WITH CHECK (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_prayer_times_update"
    ON public.campus_prayer_times FOR UPDATE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_prayer_times_delete"
    ON public.campus_prayer_times FOR DELETE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

  -- campus_jummah
  DROP POLICY IF EXISTS "campus_jummah_insert_member" ON public.campus_jummah;
  DROP POLICY IF EXISTS "campus_jummah_update_member" ON public.campus_jummah;
  DROP POLICY IF EXISTS "campus_jummah_delete_member" ON public.campus_jummah;
  CREATE POLICY "campus_jummah_insert"
    ON public.campus_jummah FOR INSERT
    WITH CHECK (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_jummah_update"
    ON public.campus_jummah FOR UPDATE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_jummah_delete"
    ON public.campus_jummah FOR DELETE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

  -- campus_events
  DROP POLICY IF EXISTS "campus_events_insert_member" ON public.campus_events;
  DROP POLICY IF EXISTS "campus_events_update_member" ON public.campus_events;
  DROP POLICY IF EXISTS "campus_events_delete_member" ON public.campus_events;
  CREATE POLICY "campus_events_insert"
    ON public.campus_events FOR INSERT
    WITH CHECK (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_events_update"
    ON public.campus_events FOR UPDATE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_events_delete"
    ON public.campus_events FOR DELETE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

  -- campus_announcements
  DROP POLICY IF EXISTS "campus_announcements_insert_member" ON public.campus_announcements;
  DROP POLICY IF EXISTS "campus_announcements_update_member" ON public.campus_announcements;
  DROP POLICY IF EXISTS "campus_announcements_delete_member" ON public.campus_announcements;
  CREATE POLICY "campus_announcements_insert"
    ON public.campus_announcements FOR INSERT
    WITH CHECK (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_announcements_update"
    ON public.campus_announcements FOR UPDATE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_announcements_delete"
    ON public.campus_announcements FOR DELETE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

  -- campus_resources
  DROP POLICY IF EXISTS "campus_resources_insert_member" ON public.campus_resources;
  DROP POLICY IF EXISTS "campus_resources_update_member" ON public.campus_resources;
  DROP POLICY IF EXISTS "campus_resources_delete_member" ON public.campus_resources;
  CREATE POLICY "campus_resources_insert"
    ON public.campus_resources FOR INSERT
    WITH CHECK (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_resources_update"
    ON public.campus_resources FOR UPDATE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
  CREATE POLICY "campus_resources_delete"
    ON public.campus_resources FOR DELETE
    USING (
      public.is_active_msa_member(msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

  -- msa_onboarding_requests
  DROP POLICY IF EXISTS "msa_onboarding_requests_update_admin" ON public.msa_onboarding_requests;
  CREATE POLICY "msa_onboarding_requests_update_admin"
    ON public.msa_onboarding_requests FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

END $$;
