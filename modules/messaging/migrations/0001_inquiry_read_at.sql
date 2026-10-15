-- M72: add read_at column to inquiry table for server-side read receipts
ALTER TABLE messaging.inquiry ADD COLUMN IF NOT EXISTS read_at timestamptz;
