-- Migration: 0008 stories
-- Adds Instagram-style stories that expire after 24 hours.

CREATE TABLE IF NOT EXISTS discover.story (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   UUID NOT NULL,
  media_url   TEXT NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  duration    INTEGER NOT NULL DEFAULT 5 CHECK (duration BETWEEN 1 AND 60),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS story_author_id_idx   ON discover.story (author_id);
CREATE INDEX IF NOT EXISTS story_expires_at_idx  ON discover.story (expires_at);
CREATE INDEX IF NOT EXISTS story_created_at_idx  ON discover.story (created_at);

CREATE TABLE IF NOT EXISTS discover.story_view (
  story_id    UUID NOT NULL REFERENCES discover.story (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, user_id)
);

CREATE INDEX IF NOT EXISTS story_view_user_id_idx ON discover.story_view (user_id);
