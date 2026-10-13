CREATE TYPE asset_status AS ENUM ('pending', 'processing', 'ready', 'failed');
CREATE TYPE asset_purpose AS ENUM ('provider_photo');
CREATE TYPE asset_mime AS ENUM ('image/jpeg', 'image/png', 'image/webp');

CREATE TABLE asset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  purpose asset_purpose NOT NULL,
  mime asset_mime NOT NULL,
  storage_key VARCHAR(128) UNIQUE,
  size_bytes INTEGER NOT NULL,
  status asset_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX ON asset(owner_id);
CREATE INDEX ON asset(status) WHERE status = 'processing';
