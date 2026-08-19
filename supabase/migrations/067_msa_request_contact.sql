-- 067_msa_request_contact.sql
--
-- Adds contact fields to msa_onboarding_requests so the Rihdal team
-- knows where to send the claim code (email and/or Instagram DM).

ALTER TABLE public.msa_onboarding_requests
  ADD COLUMN IF NOT EXISTS contact_email     text,
  ADD COLUMN IF NOT EXISTS contact_instagram text;
