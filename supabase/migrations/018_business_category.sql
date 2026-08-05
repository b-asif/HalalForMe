-- 018_business_category.sql
-- Adds a category to the (untracked) restaurants table so it can represent
-- grocery stores and butchers, not just restaurants — reuses the entire
-- existing listing infrastructure (certifiers, zabihah, hours, photos,
-- geo) rather than a parallel schema, since none of it is restaurant-
-- specific. Grocery/butcher listings are admin-curated only (no public
-- submission, no owner claiming) — see CHANGELOG.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'restaurant'
  CHECK (category IN ('restaurant', 'grocery', 'butcher'));

CREATE INDEX IF NOT EXISTS restaurants_category_idx ON public.restaurants (category);
