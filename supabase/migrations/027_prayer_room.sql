-- Migration 027: Prayer room flag on restaurants
-- Adds has_prayer_room boolean to the restaurants table.
-- Existing rows default to false. Admins mark listings during review/edit.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS has_prayer_room boolean NOT NULL DEFAULT false;
