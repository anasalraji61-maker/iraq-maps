-- Extend incidents with severity, anonymous flag, vote counts, and vote table.
-- Also adds more incident types.

ALTER TABLE incidents.incident
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'moderate'
    CHECK (severity IN ('minor', 'moderate', 'severe')),
  ADD COLUMN IF NOT EXISTS anonymous boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_count integer NOT NULL DEFAULT 0;

-- Widen the type enum to include additional types.
ALTER TABLE incidents.incident
  DROP CONSTRAINT IF EXISTS incident_type_check;

ALTER TABLE incidents.incident
  ADD CONSTRAINT incident_type_check CHECK (type IN (
    'accident', 'road_closure', 'pothole', 'flooding', 'traffic_jam',
    'wrong_way', 'hazard', 'police', 'speed_camera',
    'roadblock', 'flood', 'construction', 'other'
  ));

-- Vote table: one row per user per incident.
CREATE TABLE IF NOT EXISTS incidents.incident_vote (
  user_id     uuid        NOT NULL,
  incident_id uuid        NOT NULL REFERENCES incidents.incident (id) ON DELETE CASCADE,
  is_confirm  boolean     NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, incident_id)
);

CREATE INDEX IF NOT EXISTS incident_vote_incident_idx ON incidents.incident_vote (incident_id);

-- Contributor summary view (refreshed by application, not materialised to keep tests simple).
CREATE TABLE IF NOT EXISTS incidents.contributor_stats (
  user_id       uuid        PRIMARY KEY,
  city_id       text        NOT NULL DEFAULT 'baghdad',
  incident_count integer    NOT NULL DEFAULT 0,
  review_count  integer     NOT NULL DEFAULT 0,
  place_count   integer     NOT NULL DEFAULT 0,
  photo_count   integer     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contributor_stats_city_idx ON incidents.contributor_stats (city_id);
