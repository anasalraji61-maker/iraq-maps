CREATE SCHEMA IF NOT EXISTS providers;

CREATE TYPE providers.provider_status AS ENUM ('draft', 'pending', 'verified', 'suspended');
CREATE TYPE providers.consent_scope AS ENUM ('photos', 'social_links', 'whatsapp_messages', 'show_phone', 'show_prices');

CREATE TABLE providers.provider (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status providers.provider_status NOT NULL DEFAULT 'draft',
  business_phone VARCHAR(32),
  business_phone_verified_at TIMESTAMPTZ,
  phone_verification_id VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(64) NOT NULL,
  location GEOMETRY(Point, 4326),
  claimed_place_id VARCHAR(64),
  hours_raw VARCHAR(255),
  prices JSONB NOT NULL DEFAULT '[]',
  links JSONB NOT NULL DEFAULT '[]',
  photo_asset_ids JSONB NOT NULL DEFAULT '[]',
  suspension_reason VARCHAR(500),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE providers.consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers.provider(id) ON DELETE CASCADE,
  scope providers.consent_scope NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  evidence JSONB NOT NULL,
  UNIQUE (provider_id, scope)
);

CREATE TABLE providers.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers.provider(id) ON DELETE CASCADE,
  action VARCHAR(32) NOT NULL,
  actor_user_id UUID NOT NULL,
  reason VARCHAR(500),
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON providers.provider(user_id);
CREATE INDEX ON providers.provider(claimed_place_id);
CREATE INDEX ON providers.consent(provider_id) WHERE revoked_at IS NULL;
CREATE INDEX ON providers.audit_log(provider_id);
