-- 022_mosque_invite_code_lockdown.sql
-- SECURITY FIX (Critical, security audit 2026-07-11): `invite_code` was
-- reachable through the public "Public read access on mosques" policy from
-- 017_mosques.sql. RLS is row-level only — USING (true) exposes every
-- column of a visible row, including invite_code, to anyone with the public
-- anon key. That defeated the entire out-of-band invite model described in
-- 017's own comments: a single query (`select('invite_code').is('owner_id',
-- null)`) could dump every unclaimed mosque's code, letting an attacker
-- claim ownership of any of them via redeem_mosque_invite() without ever
-- being handed a code by an admin.
--
-- Fixed with a column-level REVOKE rather than restructuring the table or
-- adding a public-facing view — the row-level policy (public read of name,
-- address, iqama times, contact info, etc.) is correct and intentional;
-- only this one column needed to stop being publicly selectable.

REVOKE SELECT (invite_code) ON public.mosques FROM anon, authenticated;

-- Admins still need to read a mosque's code to hand it to a contact
-- out-of-band. This SECURITY DEFINER RPC (same pattern as
-- redeem_mosque_invite in 017) is now the only path to it — nobody,
-- including an authenticated non-admin, can SELECT invite_code from the
-- table directly anymore, and this function checks admin status itself
-- before returning anything.
CREATE OR REPLACE FUNCTION public.get_mosque_invite_code(p_mosque_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT invite_code INTO v_code FROM public.mosques WHERE id = p_mosque_id;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_mosque_invite_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mosque_invite_code(uuid) TO authenticated;

-- Hardening (audit finding M4, Low-severity but cheap to close): pin
-- search_path on the SECURITY DEFINER trigger functions from 009/011 that
-- were missing it. Without a pinned search_path, a definer function
-- resolves unqualified names using the CALLER's search_path — an attacker
-- able to create same-named objects earlier on that path could hijack what
-- the function operates on. redeem_mosque_invite (017) and delete_user
-- (005) already did this correctly; these five didn't.
ALTER FUNCTION public.check_and_award_badges(uuid) SET search_path = public;
ALTER FUNCTION public.award_submission_points() SET search_path = public;
ALTER FUNCTION public.award_photo_points() SET search_path = public;
ALTER FUNCTION public.award_review_points() SET search_path = public;
ALTER FUNCTION public.approve_review_photos() SET search_path = public;
