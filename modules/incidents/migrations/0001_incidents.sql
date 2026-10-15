-- Traffic incidents reported by users.
CREATE SCHEMA IF NOT EXISTS incidents;

CREATE TABLE incidents.incident (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text        NOT NULL CHECK (type IN ('accident', 'roadblock', 'flood', 'construction', 'other')),
  location    geography(Point, 4326) NOT NULL,
  description text        CHECK (char_length(description) <= 500),
  reported_by uuid,       -- nullable; identity.users.id (cross-schema reference, no FK to keep schemas independent)
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE INDEX incidents_location_gist  ON incidents.incident USING GIST (location);
CREATE INDEX incidents_expires_at_idx ON incidents.incident (expires_at);
