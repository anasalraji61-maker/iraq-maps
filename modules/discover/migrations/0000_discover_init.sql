CREATE SCHEMA IF NOT EXISTS discover;

CREATE TABLE discover.post (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL,
  place_id UUID,
  type TEXT NOT NULL CHECK (type IN ('photo','tip','event','offer')),
  body TEXT NOT NULL CHECK (length(body) <= 1000),
  media_asset_ids UUID[] NOT NULL DEFAULT '{}',
  like_count INT NOT NULL DEFAULT 0,
  comment_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE discover.post_like (
  post_id UUID NOT NULL REFERENCES discover.post(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE discover.comment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES discover.post(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (length(body) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON discover.post(created_at DESC);
CREATE INDEX ON discover.comment(post_id, created_at);
