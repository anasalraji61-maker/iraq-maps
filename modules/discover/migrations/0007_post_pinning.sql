-- Add isPinned field to post table for provider profile pinning.
ALTER TABLE discover.post ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
