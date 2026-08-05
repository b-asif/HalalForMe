-- 028: add categories array column to mosque_posts for multi-tag events
-- Keeps the existing category column for backwards compatibility during rollout,
-- but adds categories text[] as the authoritative multi-value field.
-- category is kept as a generated/derived "primary" category for any code that
-- still reads the single column (it takes the first element of categories).

ALTER TABLE mosque_posts
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';

-- Back-fill: populate categories from existing single category values
UPDATE mosque_posts
SET categories = ARRAY[category]
WHERE category IS NOT NULL
  AND (categories IS NULL OR categories = '{}');

-- Index for fast array-contains queries: WHERE 'youth' = ANY(categories)
CREATE INDEX IF NOT EXISTS idx_mosque_posts_categories
  ON mosque_posts USING gin(categories);
