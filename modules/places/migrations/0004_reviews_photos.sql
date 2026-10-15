-- Migration: 0004 review photos
-- Adds photo asset IDs to the review table.

ALTER TABLE places.review
  ADD COLUMN IF NOT EXISTS photo_asset_ids uuid[] NOT NULL DEFAULT '{}';
