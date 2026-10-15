-- Social graph module: follow relationships and blocks
-- Schema: social

CREATE SCHEMA IF NOT EXISTS social;

-- ─── Follow relationships ───────────────────────────────────────────────────

CREATE TABLE social.follows (
  follower_id  UUID        NOT NULL,
  following_id UUID        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (follower_id, following_id),
  -- Can't follow yourself — enforced at DB level
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX follows_follower_idx  ON social.follows (follower_id);
CREATE INDEX follows_following_idx ON social.follows (following_id);
CREATE INDEX follows_created_at_idx ON social.follows (created_at DESC);

-- ─── Blocks ────────────────────────────────────────────────────────────────

CREATE TABLE social.blocks (
  blocker_id  UUID        NOT NULL,
  blocked_id  UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

CREATE INDEX blocks_blocker_idx ON social.blocks (blocker_id);
CREATE INDEX blocks_blocked_idx ON social.blocks (blocked_id);

-- ─── Dismissed suggestions ────────────────────────────────────────────────

CREATE TABLE social.dismissed_suggestions (
  user_id     UUID        NOT NULL,
  target_id   UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, target_id)
);

CREATE INDEX dismissed_user_idx ON social.dismissed_suggestions (user_id);
