-- Add soft-delete support to the comment table.
ALTER TABLE discover.comment ADD COLUMN IF NOT EXISTS removed_at timestamptz;
