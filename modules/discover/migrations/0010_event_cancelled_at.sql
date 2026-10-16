-- Migration: add cancelled_at column to event table for soft-cancel support
ALTER TABLE discover.event ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
