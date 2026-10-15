-- M73: add discover and messages notification preference columns
ALTER TABLE notifications.prefs
  ADD COLUMN IF NOT EXISTS discover_likes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discover_comments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS messages boolean NOT NULL DEFAULT true;
