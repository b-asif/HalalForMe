-- ================================================================
-- Migration 033: Storage bucket file size limits + MIME type policies
--
-- Problem: storage buckets had no server-side file size limit and no
-- MIME type enforcement. A caller can bypass the client-side base64
-- length check (app/submit-restaurant.tsx) by hitting the storage API
-- directly, uploading arbitrarily large or non-image files.
--
-- Two layers of protection:
--
-- 1. file_size_limit on each bucket — Supabase enforces this before
--    the upload reaches storage, regardless of the client. Set to 5 MB
--    (5_242_880 bytes), matching the existing client-side check intent.
--
-- 2. RLS INSERT policy checking metadata->>'mimetype' — blocks uploads
--    where the declared content type is not an allowed image format.
--    Note: the mimetype in metadata comes from the Content-Type the
--    client sends, not server-side sniffing, so a determined attacker
--    can still lie. The file_size_limit is the more robust control;
--    the mimetype check stops accidental or low-effort abuse.
--
-- Idempotent: UPDATE is always safe to re-run; DROP POLICY IF EXISTS
-- guards the policy creation.
-- ================================================================

-- ── File size limits ──────────────────────────────────────────────────────────
UPDATE storage.buckets
  SET file_size_limit = 5242880  -- 5 MB
WHERE id IN ('gallery_photos', 'halal_certificates');

-- ── MIME type policies ────────────────────────────────────────────────────────

-- gallery_photos: food and restaurant photos from submit-restaurant and
-- review flows. Only JPEG and PNG are accepted.
DROP POLICY IF EXISTS "gallery_photos_images_only" ON storage.objects;
CREATE POLICY "gallery_photos_images_only"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'gallery_photos'
    AND (metadata->>'mimetype') IN ('image/jpeg', 'image/png')
  );

-- halal_certificates: certification photos uploaded at submission time.
-- Same image-only restriction.
DROP POLICY IF EXISTS "halal_certificates_images_only" ON storage.objects;
CREATE POLICY "halal_certificates_images_only"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'halal_certificates'
    AND (metadata->>'mimetype') IN ('image/jpeg', 'image/png')
  );

-- avatars: profile photos. Same restriction.
DROP POLICY IF EXISTS "avatars_images_only" ON storage.objects;
CREATE POLICY "avatars_images_only"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (metadata->>'mimetype') IN ('image/jpeg', 'image/png')
  );
