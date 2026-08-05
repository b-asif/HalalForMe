-- 035_owner_submission.sql
-- Adds submitted_as_owner flag to submissions so the "Add my business"
-- wizard can signal that the submitter claims ownership of the listing.
-- When this is true, the admin review screen auto-sets owner_id on approval.

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS submitted_as_owner boolean NOT NULL DEFAULT false;
