-- 068_msa_request_proposed_university.sql
--
-- Allows MSA onboarding requests where the university is not yet in our database.
-- university_id becomes nullable; proposed_university_name stores the free-text name.
-- approve_msa_request is updated to auto-create the university if needed.

-- Make university_id nullable
ALTER TABLE public.msa_onboarding_requests
  ALTER COLUMN university_id DROP NOT NULL;

-- Add proposed university name
ALTER TABLE public.msa_onboarding_requests
  ADD COLUMN IF NOT EXISTS proposed_university_name text;

-- ── Updated approve_msa_request ───────────────────────────────────────────────
-- Now also handles university_id IS NULL by creating the university first.
DROP FUNCTION IF EXISTS public.approve_msa_request(uuid);
DROP FUNCTION IF EXISTS public.approve_msa_request(uuid, uuid);

CREATE OR REPLACE FUNCTION public.approve_msa_request(
  p_request_id uuid,
  p_msa_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin  boolean;
  v_request   msa_onboarding_requests%ROWTYPE;
  v_uni_id    uuid;
  v_msa_id    uuid;
BEGIN
  -- Admin guard
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_request FROM msa_onboarding_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_request.status NOT IN ('pending', 'code_sent') THEN
    RAISE EXCEPTION 'Request is already %', v_request.status;
  END IF;

  -- Resolve university — create if not yet in DB
  v_uni_id := v_request.university_id;
  IF v_uni_id IS NULL THEN
    IF v_request.proposed_university_name IS NULL THEN
      RAISE EXCEPTION 'No university specified and no proposed university name in request';
    END IF;
    INSERT INTO public.universities (name, slug)
    VALUES (
      v_request.proposed_university_name,
      lower(regexp_replace(v_request.proposed_university_name, '[^a-zA-Z0-9]+', '-', 'g'))
    )
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_uni_id;

    -- Backfill the request with the real university_id
    UPDATE msa_onboarding_requests SET university_id = v_uni_id WHERE id = p_request_id;
  END IF;

  -- Resolve MSA: caller-supplied > request's stored msa_id > create from proposed name
  v_msa_id := COALESCE(p_msa_id, v_request.msa_id);
  IF v_msa_id IS NULL THEN
    IF v_request.proposed_msa_name IS NULL THEN
      RAISE EXCEPTION 'No MSA specified and no proposed name in request';
    END IF;
    INSERT INTO public.msas (university_id, name)
    VALUES (v_uni_id, v_request.proposed_msa_name)
    RETURNING id INTO v_msa_id;
  END IF;

  -- Upsert msa_members
  INSERT INTO public.msa_members (user_id, msa_id, role, status, approved_at, approved_by)
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

GRANT EXECUTE ON FUNCTION public.approve_msa_request TO authenticated;
