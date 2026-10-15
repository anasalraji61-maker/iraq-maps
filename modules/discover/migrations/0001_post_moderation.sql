-- M11: post soft-delete and report tracking
ALTER TABLE discover.post ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS discover.post_report (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID        NOT NULL REFERENCES discover.post(id) ON DELETE CASCADE,
  reporter_id UUID        NOT NULL,
  reason      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS post_report_post_id_idx ON discover.post_report (post_id);
