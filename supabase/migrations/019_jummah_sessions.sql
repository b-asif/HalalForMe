-- 019_jummah_sessions.sql
-- Jummah (Friday prayer) commonly runs multiple sessions at one mosque, each
-- with its own khateeb, and the khateeb rotates weekly — a single "jumuah"
-- time string in mosques.iqama_times can't represent that. Pulled out into
-- its own column: an array of { time: string, khateeb: string | null },
-- always overwritten in place (no history), same "current state only" model
-- as iqama_times.

ALTER TABLE public.mosques
  ADD COLUMN IF NOT EXISTS jummah_sessions jsonb;
