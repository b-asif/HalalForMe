-- 065_msa_request_rpc.sql
--
-- RPCs for MSA onboarding request approval / rejection.
-- Both are SECURITY DEFINER so the caller doesn't need direct table access.
-- The UI enforces admin-only access; the RLS on msa_onboarding_requests enforces it at DB level.

-- RLS for msa_onboarding_requests (anyone authenticated can insert their own; admins read all)
ALTER TABLE public.msa_onboarding_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'msa_onboarding_requests' AND policyname = 'Users insert own requests'
  ) THEN
    CREATE POLICY "Users insert own requests"
      ON public.msa_onboarding_requests FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'msa_onboarding_requests' AND policyname = 'Users read own requests'
  ) THEN
    CREATE POLICY "Users read own requests"
      ON public.msa_onboarding_requests FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ── approve_msa_request ────────────────────────────────────────────────────────
-- Drop all overloads first (ambiguous signatures from prior runs)
DROP FUNCTION IF EXISTS public.approve_msa_request(uuid);
DROP FUNCTION IF EXISTS public.approve_msa_request(uuid, uuid);

-- Approves a pending request: optionally creates a new MSA, then creates an
-- active admin msa_members record for the requester.
CREATE OR REPLACE FUNCTION public.approve_msa_request(
  p_request_id uuid,
  p_msa_id     uuid DEFAULT NULL
)
RETURNS uuid   -- returns the msa_id that was linked
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request   msa_onboarding_requests%ROWTYPE;
  v_msa_id    uuid;
BEGIN
  SELECT * INTO v_request FROM msa_onboarding_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_request.status NOT IN ('pending', 'code_sent') THEN
    RAISE EXCEPTION 'Request is already %', v_request.status;
  END IF;

  -- Resolve MSA: caller-supplied > request's stored msa_id > create from proposed name
  v_msa_id := COALESCE(p_msa_id, v_request.msa_id);

  IF v_msa_id IS NULL THEN
    IF v_request.proposed_msa_name IS NULL THEN
      RAISE EXCEPTION 'No MSA specified and no proposed name in request';
    END IF;
    INSERT INTO msas (university_id, name)
    VALUES (v_request.university_id, v_request.proposed_msa_name)
    RETURNING id INTO v_msa_id;
  END IF;

  -- Upsert msa_members — grant admin role
  INSERT INTO msa_members (user_id, msa_id, role, status, approved_at, approved_by)
  VALUES (v_request.user_id, v_msa_id, 'admin', 'active', now(), auth.uid())
  ON CONFLICT (user_id, msa_id) DO UPDATE
    SET role = 'admin', status = 'active', approved_at = now(), approved_by = auth.uid();

  -- Mark request approved
  UPDATE msa_onboarding_requests
  SET status      = 'approved',
      msa_id      = v_msa_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_request_id;

  RETURN v_msa_id;
END;
$$;

-- ── reject_msa_request ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.reject_msa_request(uuid);
DROP FUNCTION IF EXISTS public.reject_msa_request(uuid, text);

CREATE OR REPLACE FUNCTION public.reject_msa_request(
  p_request_id uuid,
  p_notes      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE msa_onboarding_requests
  SET status         = 'rejected',
      reviewer_notes = p_notes,
      reviewed_by    = auth.uid(),
      reviewed_at    = now()
  WHERE id = p_request_id AND status IN ('pending', 'code_sent');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_msa_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_msa_request  TO authenticated;
