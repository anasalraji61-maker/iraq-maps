-- City registry, from city.json (CityImportRecord): hand-written city config, not OSM data.
CREATE TABLE places.cities (
  id text PRIMARY KEY,
  names jsonb NOT NULL,
  bbox jsonb NOT NULL,
  center jsonb NOT NULL
);

-- Places (POIs), streets and areas from places.ndjson (PlaceImportRecord). OSM-derived columns ONLY (ODbL): provider
-- data goes in separate tables, so this one can be published or dropped on its own. src/places.test.ts pins the columns.
CREATE TABLE places.osm_features (
  id text PRIMARY KEY, -- OSM element type letter + id (n123, w45, r6), also the PlaceId
  city_id text NOT NULL REFERENCES places.cities (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('place', 'street', 'area')),
  category text,
  names jsonb NOT NULL, -- name, ar, ckb, en
  search_text text NOT NULL, -- every name through normalizeArabic, plus variants without the article
  location geography(Point, 4326) NOT NULL,
  area_names jsonb, -- names of the nearest area within 3 km, set at import
  opening_hours text,
  phone text,
  website text
);
CREATE INDEX osm_features_search_idx ON places.osm_features USING gin (search_text gin_trgm_ops);
CREATE INDEX osm_features_location_idx ON places.osm_features USING gist (location);
