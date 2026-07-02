-- ============================================================
-- Migration: self-service account deletion RPC
-- Run this in the Supabase SQL editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete user content in dependency order so no FK/trigger can block auth deletion

  -- Saved restaurants
  DELETE FROM public.saved_restaurants WHERE user_id = uid;

  -- Reviews
  DELETE FROM public.reviews WHERE user_id = uid;

  -- Restaurant claims
  DELETE FROM public.restaurant_claims WHERE user_id = uid;

  -- Submissions (restaurant submissions awaiting review)
  DELETE FROM public.submissions WHERE user_id = uid;

  -- Profile (must come after child rows that reference it)
  DELETE FROM public.profiles WHERE id = uid;

  -- Finally remove the auth user
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Restrict execution to authenticated users only
REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
