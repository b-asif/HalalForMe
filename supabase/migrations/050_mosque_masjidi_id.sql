-- 050_mosque_masjidi_id.sql
-- Adds an optional masjidi_id column to mosques so that mosques listed on
-- Masjidi/UmmahSoft can have their prayer times fetched directly from the
-- widget API, even when their website doesn't embed the widget.
ALTER TABLE public.mosques
  ADD COLUMN IF NOT EXISTS masjidi_id text;
