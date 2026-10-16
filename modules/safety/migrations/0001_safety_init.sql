-- Safety module schema
-- All tables live in the `safety` schema (module boundary rule).

CREATE SCHEMA IF NOT EXISTS safety;

-- ── Safety incidents ────────────────────────────────────────────────────────

CREATE TABLE safety.incident (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'medium',
  status        TEXT NOT NULL DEFAULT 'active',
  location      GEOGRAPHY(Point, 4326) NOT NULL,
  city_id       TEXT NOT NULL DEFAULT 'baghdad',
  description   TEXT,
  reported_by   UUID,       -- NULL when anonymous
  anonymous     BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_count INT NOT NULL DEFAULT 0,
  admin_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX safety_incident_location_idx
  ON safety.incident USING GIST (location);
CREATE INDEX safety_incident_city_expires_idx
  ON safety.incident (city_id, expires_at)
  WHERE status != 'dismissed';

-- ── Safety alert subscriptions ──────────────────────────────────────────────

CREATE TABLE safety.alert_subscription (
  user_id         UUID PRIMARY KEY,
  city_id         TEXT NOT NULL DEFAULT 'baghdad',
  enabled_types   TEXT[] NOT NULL DEFAULT '{}',
  min_severity    TEXT NOT NULL DEFAULT 'medium',
  radius_km       NUMERIC(6,2) NOT NULL DEFAULT 20,
  push_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Trusted contacts ────────────────────────────────────────────────────────

CREATE TABLE safety.trusted_contact (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  contact_user_id UUID NOT NULL,
  accepted        BOOLEAN NOT NULL DEFAULT FALSE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, contact_user_id)
);

CREATE INDEX safety_trusted_contact_user_idx
  ON safety.trusted_contact (user_id);
CREATE INDEX safety_trusted_contact_contact_idx
  ON safety.trusted_contact (contact_user_id);

-- ── Live location shares (safety-scoped) ───────────────────────────────────

CREATE TABLE safety.location_share (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_id            UUID NOT NULL,
  viewer_ids           UUID[] NOT NULL DEFAULT '{}',
  last_lng             DOUBLE PRECISION,
  last_lat             DOUBLE PRECISION,
  expires_at           TIMESTAMPTZ NOT NULL,
  emergency_triggered  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX safety_location_share_sharer_idx
  ON safety.location_share (sharer_id, expires_at);

-- ── Emergency alerts ────────────────────────────────────────────────────────

CREATE TABLE safety.emergency_alert (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL,
  type                  TEXT NOT NULL DEFAULT 'sos',
  last_lng              DOUBLE PRECISION,
  last_lat              DOUBLE PRECISION,
  message               TEXT,
  notified_contact_ids  UUID[] NOT NULL DEFAULT '{}',
  share_created         BOOLEAN NOT NULL DEFAULT FALSE,
  share_id              UUID,
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX safety_emergency_alert_user_idx
  ON safety.emergency_alert (user_id, sent_at DESC);
