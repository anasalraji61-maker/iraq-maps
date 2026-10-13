-- Provider-owned places (not OSM-derived). Kept separate from osm_features to preserve ODbL isolation.
-- id is providerPlaceId(providerId) = 'p<providerId>'.
CREATE TABLE IF NOT EXISTS places.provider_place (
  id text PRIMARY KEY,
  provider_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  location geography(Point, 4326),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
