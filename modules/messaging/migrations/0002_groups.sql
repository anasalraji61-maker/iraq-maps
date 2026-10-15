-- Migration: 0002 group messaging
-- Adds group conversations to the messaging module.

CREATE TABLE IF NOT EXISTS messaging.group (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS group_created_by_idx ON messaging.group (created_by);

CREATE TABLE IF NOT EXISTS messaging.group_member (
  group_id    UUID NOT NULL REFERENCES messaging.group (id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_member_user_id_idx ON messaging.group_member (user_id);

CREATE TABLE IF NOT EXISTS messaging.group_message (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES messaging.group (id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS group_message_group_id_idx ON messaging.group_message (group_id, created_at DESC);
