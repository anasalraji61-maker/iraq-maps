-- Add quiet_hours fields to prefs table (Baghdad timezone = UTC+3, stored as HH:MM text).
-- Also adds expires_at to notifications so the cleanup CRON can use an index.
ALTER TABLE notifications.prefs
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quiet_start text NOT NULL DEFAULT '23:00',
  ADD COLUMN IF NOT EXISTS quiet_end   text NOT NULL DEFAULT '08:00';

ALTER TABLE notifications.notification
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Index for cleanup CRON query (delete WHERE expires_at < now() OR created_at < now()-30d)
CREATE INDEX IF NOT EXISTS notification_cleanup_idx
  ON notifications.notification (created_at)
  WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS notification_expires_idx
  ON notifications.notification (expires_at)
  WHERE expires_at IS NOT NULL;
