-- 046: Guides redesign — expand category values + add location field
-- Expands from 3 categories (campus/cafe/food) to 8, and adds a free-text
-- location field (e.g. "San Jose, CA" or "Tokyo, Japan") for geographic context.

-- 1. Drop the old CHECK constraint (category was campus | cafe | food)
ALTER TABLE guides DROP CONSTRAINT IF EXISTS guides_category_check;

-- 2. Migrate existing category values to new naming
UPDATE guides SET category = 'universities' WHERE category = 'campus';
UPDATE guides SET category = 'cafes'        WHERE category = 'cafe';
-- 'food' stays as 'food'

-- 3. Add the new CHECK constraint with all 8 category values
ALTER TABLE guides ADD CONSTRAINT guides_category_check
  CHECK (category IN ('universities', 'cities', 'travel', 'food', 'cafes', 'ramadan', 'family', 'reverts'));

-- 4. Add location field (free-text, e.g. "Davis, CA" or "Tokyo, Japan")
ALTER TABLE guides ADD COLUMN IF NOT EXISTS location text;
