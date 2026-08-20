-- ================================================================
-- Migration 073: Rate limit on MSA claim code redemption attempts
--
-- Problem: redeem_msa_claim_code (migration 066) accepts unlimited
-- attempts from any authenticated user. An attacker could brute-force
-- the 8-hex-character code space (~4.3 billion) given enough time.
--
-- Fix: add a lightweight attempts log table and enforce a cap of
-- 10 attempts per user per hour inside the SECURITY DEFINER function.
-- Legitimate users need exactly 1 attempt; 10/hour is generous while
-- making automated brute-force impractical.
-- ================================================================

-- ── Attempt log table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.msa_claim_code_attempts (
  id           uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.msa_claim_code_attempts ENABLE ROW LEVEL SECURITY;
-- No public policies — only accessed via SECURITY DEFINER function below.

CREATE INDEX IF NOT EXISTS msa_claim_code_attempts_user_time
  ON public.msa_claim_code_attempts (user_id, attempted_at);

-- ── Replace redeem_msa_claim_code with rate-limited version ───────
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
  v_attempts  integer;
BEGIN
  -- Rate limit: max 10 attempts per user per hour
  SELECT COUNT(*) INTO v_attempts
  FROM public.msa_claim_code_attempts
  WHERE user_id      = auth.uid()
    AND attempted_at > now() - interval '1 hour';

  IF v_attempts >= 10 THEN
    RAISE EXCEPTION 'Too many attempts. Please wait before trying again.';
  END IF;

  -- Record this attempt before evaluating the code
  INSERT INTO public.msa_claim_code_attempts (user_id) VALUES (auth.uid());

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

GRANT EXECUTE ON FUNCTION public.redeem_msa_claim_code TO authenticated;
