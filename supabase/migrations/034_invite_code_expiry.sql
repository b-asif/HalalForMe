-- ================================================================
-- Migration 034: Add expiry to mosque invite codes
--
-- Prior state: invite codes were single-use (redeemed via
-- redeem_mosque_invite which requires owner_id IS NULL), but had no
-- time limit — an unissued code remained valid indefinitely.
--
-- Fix: add invite_code_expires_at column; update redeem_mosque_invite
-- to reject expired codes. Existing codes (NULL expires_at) remain
-- valid for backward compatibility.
--
-- Column is hidden from public/authenticated SELECT the same way
-- invite_code is (022_mosque_invite_code_lockdown.sql).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- ================================================================

ALTER TABLE public.mosques
  ADD COLUMN IF NOT EXISTS invite_code_expires_at timestamptz;

-- Prevent direct reads of the expiry column (same pattern as invite_code).
REVOKE SELECT (invite_code_expires_at) ON public.mosques FROM anon, authenticated;

-- Update the redemption RPC to reject expired codes.
CREATE OR REPLACE FUNCTION public.redeem_mosque_invite(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mosque_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  UPDATE public.mosques
  SET owner_id = auth.uid()
  WHERE invite_code = p_code
    AND owner_id IS NULL
    AND (invite_code_expires_at IS NULL OR invite_code_expires_at > now())
  RETURNING id INTO v_mosque_id;

  IF v_mosque_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or already-used invite code';
  END IF;

  RETURN v_mosque_id;
END;
$$;
