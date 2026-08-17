-- Add business_type to profiles so we can gate menu items per user role.
-- Values: 'restaurant' | 'mosque' | 'other' | NULL (regular user / skipped)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_type text
    CHECK (business_type IN ('restaurant', 'mosque', 'other'));
