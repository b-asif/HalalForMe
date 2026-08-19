-- Migration 061: Remove still-recursive msa_members_select_msa_admin policy
-- and replace it with a SECURITY DEFINER RPC for admin member listing.
--
-- The policy used is_msa_admin(msa_id) which queries msa_members inside a
-- policy ON msa_members — PostgreSQL evaluates all permissive policies together
-- so this still triggers infinite recursion even though select_own is safe.
--
-- Safe final state for msa_members SELECT:
--   • select_own          — user reads their own row (no function call, no recursion)
--   • select_global_admin — global Rihdal admin reads any row
--   • MSA admin member list — via get_msa_members() RPC (SECURITY DEFINER, bypasses RLS)

-- Drop the offending policy
DROP POLICY IF EXISTS "msa_members_select_msa_admin" ON public.msa_members;

-- RPC: MSA admin fetches all members of their MSA
-- SECURITY DEFINER means it runs as the DB owner, bypassing RLS on msa_members.
-- Auth check inside ensures only active admins of that MSA (or global admins) can call it.
CREATE OR REPLACE FUNCTION public.get_msa_members(p_msa_id uuid)
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  msa_id       uuid,
  role         text,
  status       text,
  requested_at timestamptz,
  approved_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Caller must be an active admin of this MSA or a global Rihdal admin
  SELECT m.id, m.user_id, m.msa_id, m.role, m.status, m.requested_at, m.approved_at
  FROM public.msa_members m
  WHERE m.msa_id = p_msa_id
    AND (
      public.is_msa_admin(p_msa_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    )
  ORDER BY m.requested_at;
$$;
