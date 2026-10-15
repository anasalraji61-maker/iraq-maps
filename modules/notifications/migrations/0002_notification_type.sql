-- Add type column to notification table for digest grouping.
ALTER TABLE notifications.notification ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'general';
