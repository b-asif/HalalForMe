-- Some mosques host their events calendar on a completely separate URL
-- (e.g. Tockify, a /programs sub-page, or a separate WordPress site).
-- events_url lets the owner provide this link directly so the sync pipeline
-- can fetch it without relying on auto-detection from the main page HTML.
ALTER TABLE public.mosques
  ADD COLUMN IF NOT EXISTS events_url text;
