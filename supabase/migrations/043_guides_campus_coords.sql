-- Add campus coordinates to guides so campus-category guides can show
-- estimated travel times (walk / bike / drive) from campus to each place.
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS campus_lat DOUBLE PRECISION;
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS campus_lng DOUBLE PRECISION;
