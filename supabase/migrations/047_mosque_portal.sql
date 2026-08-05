-- 047_mosque_portal.sql
-- Adds cover photo and amenities fields to mosque pages for the Masjid Portal.
-- Written idempotently — these columns may already exist on the live DB.

ALTER TABLE mosques ADD COLUMN IF NOT EXISTS cover_image_url text;

-- amenities stores facility flags as a JSONB object:
-- { sisters_section, wudu, wheelchair, parking, kids_area, halal_food }
ALTER TABLE mosques ADD COLUMN IF NOT EXISTS amenities jsonb DEFAULT '{}'::jsonb;
