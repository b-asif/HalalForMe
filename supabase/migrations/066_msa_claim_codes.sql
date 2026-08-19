-- 066_msa_claim_codes.sql
--
-- Adds a claim-code system to the MSA onboarding flow.
-- Admins generate a one-time code that a prospective MSA president redeems
-- to become an admin member of their MSA (creating the MSA record if needed).

-- ═══════════════════════════════════════════════════════════════
-- SECTION 1 — Extend msa_onboarding_requests status constraint
-- ═══════════════════════════════════════════════════════════════

-- Drop the old check constraint (name may vary, so we try both the
-- auto-generated Postgres name and a plain pattern match via pg_constraint).
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.msa_onboarding_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%pending%approved%rejected%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.msa_onboarding_requests DROP CONSTRAINT %I', v_conname);
  END IF;
EXCEPTION WHEN others THEN
  NULL; -- constraint already gone or table doesn't exist yet
END $$;

-- Add the widened constraint
DO $$
BEGIN
  ALTER TABLE public.msa_onboarding_requests
    ADD CONSTRAINT msa_onboarding_requests_status_check
    CHECK (status IN ('pending', 'code_sent', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already present (idempotent re-run)
END $$;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 2 — msa_claim_codes table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.msa_claim_codes (
  id            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text        NOT NULL UNIQUE,                          -- 8 uppercase alphanumeric chars
  university_id uuid        REFERENCES public.universities(id) ON DELETE CASCADE,
  msa_id        uuid        REFERENCES public.msas(id) ON DELETE SET NULL,  -- null = proposing new MSA
  request_id    uuid        REFERENCES public.msa_onboarding_requests(id) ON DELETE SET NULL,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.msa_claim_codes ENABLE ROW LEVEL SECURITY;
-- No public policies — service role key bypasses RLS; RPCs use SECURITY DEFINER.

-- ═══════════════════════════════════════════════════════════════
-- SECTION 3 — generate_msa_claim_code RPC
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.generate_msa_claim_code(
  p_university_id uuid,
  p_msa_id        uuid DEFAULT NULL,
  p_request_id    uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_admin  boolean;
  v_code      text;
  v_attempts  integer := 0;
BEGIN
  -- Admin guard
  SELECT is_admin INTO v_is_admin
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- Generate a unique 8-char uppercase code, retry on collision
  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Could not generate a unique claim code after 10 attempts';
    END IF;

    v_code := upper(substring(encode(gen_random_bytes(6), 'hex'), 1, 8));

    BEGIN
      INSERT INTO public.msa_claim_codes (code, university_id, msa_id, request_id, created_by)
      VALUES (v_code, p_university_id, p_msa_id, p_request_id, auth.uid());

      EXIT; -- insert succeeded, leave loop
    EXCEPTION WHEN unique_violation THEN
      -- code collision — retry
      CONTINUE;
    END;
  END LOOP;

  -- If a request was supplied, advance its status to code_sent
  IF p_request_id IS NOT NULL THEN
    UPDATE public.msa_onboarding_requests
    SET status = 'code_sent'
    WHERE id = p_request_id
      AND status = 'pending';
  END IF;

  RETURN v_code;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 4 — redeem_msa_claim_code RPC
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.redeem_msa_claim_code(
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim     public.msa_claim_codes%ROWTYPE;
  v_msa_id    uuid;
  v_uni_id    uuid;
  v_req       public.msa_onboarding_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_claim
  FROM public.msa_claim_codes
  WHERE code        = upper(trim(replace(p_code, '-', '')))
    AND redeemed_at IS NULL
    AND expires_at  > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired code';
  END IF;

  v_uni_id := v_claim.university_id;
  v_msa_id := v_claim.msa_id;

  IF v_claim.request_id IS NOT NULL THEN
    SELECT * INTO v_req
    FROM public.msa_onboarding_requests
    WHERE id = v_claim.request_id;

    IF FOUND THEN
      -- Create university if not yet in DB
      IF v_uni_id IS NULL THEN
        IF v_req.university_id IS NOT NULL THEN
          v_uni_id := v_req.university_id;
        ELSIF v_req.proposed_university_name IS NOT NULL THEN
          INSERT INTO public.universities (name, slug)
          VALUES (
            v_req.proposed_university_name,
            lower(regexp_replace(v_req.proposed_university_name, '[^a-zA-Z0-9]+', '-', 'g'))
          )
          ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
          RETURNING id INTO v_uni_id;

          UPDATE public.msa_onboarding_requests
          SET university_id = v_uni_id WHERE id = v_claim.request_id;
        END IF;
      END IF;

      -- Create MSA if not yet in DB
      IF v_msa_id IS NULL AND v_req.proposed_msa_name IS NOT NULL AND v_uni_id IS NOT NULL THEN
        INSERT INTO public.msas (university_id, name)
        VALUES (v_uni_id, v_req.proposed_msa_name)
        RETURNING id INTO v_msa_id;
      END IF;
    END IF;
  END IF;

  IF v_msa_id IS NULL THEN
    RAISE EXCEPTION 'No MSA associated with this code';
  END IF;

  INSERT INTO public.msa_members (user_id, msa_id, role, status, approved_at, approved_by)
  VALUES (auth.uid(), v_msa_id, 'admin', 'active', now(), v_claim.created_by)
  ON CONFLICT (user_id, msa_id) DO UPDATE
    SET role        = 'admin',
        status      = 'active',
        approved_at = now();

  UPDATE public.msa_claim_codes
  SET redeemed_by = auth.uid(),
      redeemed_at = now()
  WHERE id = v_claim.id;

  IF v_claim.request_id IS NOT NULL THEN
    UPDATE public.msa_onboarding_requests
    SET status      = 'approved',
        msa_id      = v_msa_id,
        reviewed_at = now()
    WHERE id     = v_claim.request_id
      AND status IN ('pending', 'code_sent');
  END IF;

  RETURN jsonb_build_object(
    'msaId',        v_msa_id,
    'universityId', v_uni_id
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 5 — Grants
-- ═══════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.generate_msa_claim_code TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_msa_claim_code   TO authenticated;
