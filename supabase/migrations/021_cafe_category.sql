-- 021_cafe_category.sql
-- Adds 'cafe' as an allowed value in the restaurants.category CHECK constraint.
-- The existing constraint only allows 'restaurant', 'grocery', 'butcher'.
-- We drop and recreate it to include 'cafe'.

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_category_check;

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_category_check
  CHECK (category IN ('restaurant', 'grocery', 'butcher', 'cafe'));
