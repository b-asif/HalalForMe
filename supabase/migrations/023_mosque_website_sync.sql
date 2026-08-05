-- Tracks when a mosque's data was last populated via the website auto-sync
-- feature (parse-mosque-website edge function). Null means never synced.
ALTER TABLE public.mosques
  ADD COLUMN IF NOT EXISTS last_website_sync_at timestamptz;
