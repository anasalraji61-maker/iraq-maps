-- M175: comment likes
CREATE TABLE IF NOT EXISTS discover.comment_like (
  comment_id UUID NOT NULL REFERENCES discover.comment(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE discover.comment
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
