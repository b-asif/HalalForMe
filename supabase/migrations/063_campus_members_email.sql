-- Migration 063: Add email and name to get_msa_members RPC output
-- SECURITY DEFINER allows joining auth.users which is not accessible client-side.

DROP FUNCTION IF EXISTS public.get_msa_members(uuid);

CREATE OR REPLACE FUNCTION public.get_msa_members(p_msa_id uuid)
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  msa_id       uuid,
  role         text,
  status       text,
  requested_at timestamptz,
  approved_at  timestamptz,
  email        text,
  full_name    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.user_id, m.msa_id, m.role, m.status, m.requested_at, m.approved_at,
    u.email,
    p.name AS full_name
  FROM public.msa_members m
  JOIN auth.users  u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.msa_id = p_msa_id
    AND (
      public.is_msa_admin(p_msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    )
  ORDER BY m.requested_at;
$$;
