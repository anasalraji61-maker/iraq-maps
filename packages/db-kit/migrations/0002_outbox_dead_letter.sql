-- Outbox dead-letter support: track retry count, dead events, and failure reason.
ALTER TABLE platform.outbox
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dead_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_reason text;

CREATE INDEX IF NOT EXISTS outbox_dead ON platform.outbox (dead_at) WHERE dead_at IS NOT NULL;
