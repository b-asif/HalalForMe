-- Add vertical focal point for guide cover images.
-- Value is 0.0 (top) → 0.5 (center, default) → 1.0 (bottom).
-- Stored per-guide so admins can reposition any existing cover without re-uploading.
ALTER TABLE guides ADD COLUMN IF NOT EXISTS cover_focus_y float DEFAULT 0.5;
