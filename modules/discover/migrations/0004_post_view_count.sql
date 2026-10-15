-- M208: add view_count to posts
ALTER TABLE discover.post ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;
