-- 012_backfill_review_photos.sql
-- One-time backfill: approve all restaurant_photos that are linked to an
-- already-approved review but are still sitting as 'pending'.
--
-- This surfaces existing review photos in the photo tabs immediately.
-- The trg_photo_approved trigger will also fire for each row updated here,
-- awarding +10 pts per photo to the uploader — consistent with how new
-- review photos will be handled going forward.

UPDATE restaurant_photos
SET status = 'approved'
WHERE review_id IS NOT NULL
  AND status   = 'pending'
  AND review_id IN (
    SELECT id FROM reviews WHERE status = 'approved'
  );
