-- Track when iqama times were last updated so admins can see freshness
ALTER TABLE mosques ADD COLUMN IF NOT EXISTS iqama_updated_at TIMESTAMPTZ;
