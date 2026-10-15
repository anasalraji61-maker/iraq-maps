CREATE SCHEMA IF NOT EXISTS location_share;

CREATE TABLE IF NOT EXISTS location_share.share (
  share_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID,  -- no FK to identity schema (cross-schema join forbidden)
  location   geography(Point, 4326),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS share_expires_at_idx ON location_share.share (expires_at);
