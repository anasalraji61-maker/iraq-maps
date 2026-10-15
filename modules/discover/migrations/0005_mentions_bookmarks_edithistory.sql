-- M: post mentions, bookmarks, edit history, bookmark_count on post

ALTER TABLE discover.post ADD COLUMN IF NOT EXISTS bookmark_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS discover.post_mention (
  post_id     uuid NOT NULL REFERENCES discover.post(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL,
  PRIMARY KEY (post_id, mentioned_user_id)
);
CREATE INDEX IF NOT EXISTS post_mention_mentioned_user_idx ON discover.post_mention(mentioned_user_id);

CREATE TABLE IF NOT EXISTS discover.post_bookmark (
  post_id     uuid NOT NULL REFERENCES discover.post(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_bookmark_user_idx ON discover.post_bookmark(user_id);

CREATE TABLE IF NOT EXISTS discover.post_edit_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES discover.post(id) ON DELETE CASCADE,
  previous_body text NOT NULL,
  edited_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_edit_history_post_id_idx ON discover.post_edit_history(post_id);
