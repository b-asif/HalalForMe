-- Migration 062: Add rsvp_url to campus_events
ALTER TABLE public.campus_events
  ADD COLUMN IF NOT EXISTS rsvp_url text;
