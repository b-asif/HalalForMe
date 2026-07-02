-- Add moderation status to reviews, restaurant_photos, and menu_photos.
-- Existing rows default to 'approved' so nothing is hidden from the public.
-- New inserts from the app will explicitly set status = 'pending'.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

ALTER TABLE public.restaurant_photos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

ALTER TABLE public.menu_photos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

-- Indexes for the admin queue queries
CREATE INDEX IF NOT EXISTS reviews_status_idx          ON public.reviews (status);
CREATE INDEX IF NOT EXISTS restaurant_photos_status_idx ON public.restaurant_photos (status);
CREATE INDEX IF NOT EXISTS menu_photos_status_idx       ON public.menu_photos (status);
